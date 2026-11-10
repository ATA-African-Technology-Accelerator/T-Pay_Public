/// <reference types="jest" />
/// <reference types="node" />
// ACT-10 against a fake backend: only backend answers move a status, a refusal that
// can never succeed stops the retries, and once spend-by has passed and every voucher
// is uploaded, the vault is melted with no tap.
import type { ITPayApi } from '@tpay/shared/application/ports/api';
import { MemoryKv } from '../../adapters/storage/kvCore';
import { LocalStore, type AppVault, type AppVoucher } from '../../adapters/storage/localStore';

jest.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
jest.mock('expo-web-browser', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

class MockApiRequestError extends Error {
  constructor(public readonly code: string, message = code, public readonly status = 0) { super(message); }
}
jest.mock('../../adapters/api/httpApi', () => ({ ApiRequestError: MockApiRequestError }));
jest.mock('../../session/guard', () => ({
  withSession: (call: () => unknown) => call(),
  renewCertificateIfDue: async () => false,
  DeviceRevoked: class extends Error {},
}));
jest.mock('../../session/sessionStore', () => ({ sessionStore: { load: async () => ({ deviceId: 'dev_a', keyId: 'key_a' }) } }));

let mockNow = new Date('2026-11-10T10:00:00.000Z');
const mockStore = new LocalStore(Promise.resolve(new MemoryKv()));
const mockApi = {
  submitVoucher: jest.fn(),
  listVouchers: jest.fn(async () => ({ items: [], nextCursor: null })),
  getCurrentVault: jest.fn(async () => ({ vault: null })),
  getActiveWallet: jest.fn(async () => ({ balanceUsdMinor: 0, balanceNgnMinor: 0, pendingNgnMinor: 0, payoutEmail: 'a@example.com', fxRate: '1500.00', entries: [] })),
  listTransactions: jest.fn(async () => ({ items: [], nextCursor: null })),
  meltVault: jest.fn(async (vaultId: string) => ({ vaultId, status: 'CLOSED' as const, releasedAt: mockNow.toISOString(), releaseScheduledFor: null, blockingVoucherIds: [] as string[] })),
} satisfies Partial<ITPayApi>;
jest.mock('../../composition', () => ({
  store: mockStore, api: mockApi, clock: { now: () => mockNow }, random: { uuid: () => 'k', nonce: () => 'n' },
  connectivity: { isOnline: async () => true, onReconnect: () => () => {} },
  keyStore: { loadPrivateKey: async () => 'handle' },
  signer: { sign: async () => 'sig' },
}));

const { syncNow, WALLET } = require('../syncCoordinator') as typeof import('../syncCoordinator');

const vault: AppVault = {
  vaultId: 'vlt_1',
  certificate: { payload: { vaultId: 'vlt_1', keyId: 'key_a', authorisedUsdMinor: 667, amountNgnMinor: 1_000_000, fxRate: '1500.00', spendBy: '2026-11-11T10:00:00.000Z', settleBy: '2026-12-08T10:00:00.000Z' }, signature: 's' },
  reservedUsdMinor: 0, settledUsdMinor: 0, nextSequence: 3, view: null, lockedAt: mockNow.toISOString(), melt: null,
};
const voucher = (sequence: number, view: 'PAYER' | 'PAYEE' = 'PAYER'): AppVoucher => ({
  id: `${view}:vlt_1:${sequence}`,
  voucher: { payload: { vaultId: 'vlt_1', keyId: 'key_a', deviceId: 'dev_a', sequence, amountNgnMinor: 200_000, amountUsdMinor: 133, fxRate: '1500.00', payeeKeyId: 'key_m', requestNonce: 'n', issuedAt: mockNow.toISOString(), expiresAt: vault.certificate.payload.spendBy }, signature: 's' },
  receipt: null, status: 'SIGNED', view, paypalCaptureId: null, vaultCertificate: vault.certificate, request: null, frame: 'f',
  counterparty: 'Mama Nkechi', voucherId: null, stopped: null, createdAt: mockNow.toISOString(), updatedAt: mockNow.toISOString(),
});

beforeEach(async () => {
  await mockStore.wipe();
  jest.clearAllMocks();
  mockNow = new Date('2026-11-10T10:00:00.000Z');
  await mockStore.vaults.save(vault);
  mockApi.getCurrentVault.mockResolvedValue({ vault: { ...vault.certificate.payload, status: 'ACTIVE', reservedUsdMinor: 0, settledUsdMinor: 0, remainingUsdMinor: 667, paypalAuthorizationId: 'AUTH-2' } } as never);
});

it('uploads, takes the backend status and capture, and keeps the latest authorisation', async () => {
  await mockStore.vouchers.save(voucher(1));
  mockApi.submitVoucher.mockResolvedValueOnce({ voucherId: 'vch_1', status: 'SETTLED', paypalCaptureId: 'CAP-1', replay: false });
  await syncNow();
  expect(await mockStore.vouchers.find('PAYER:vlt_1:1')).toMatchObject({ status: 'SETTLED', voucherId: 'vch_1', paypalCaptureId: 'CAP-1' });
  expect((await mockStore.vaults.findCurrent())?.view?.paypalAuthorizationId).toBe('AUTH-2');
  expect(await mockStore.getMeta(WALLET)).toMatchObject({ payoutEmail: 'a@example.com' });
});

it('stops retrying a voucher the backend calls forged, and retries one that only failed to send', async () => {
  await mockStore.vouchers.save(voucher(1));
  await mockStore.vouchers.save(voucher(2));
  mockApi.submitVoucher
    .mockRejectedValueOnce(new MockApiRequestError('INVALID_SIGNATURE'))
    .mockRejectedValueOnce(new MockApiRequestError('PAYPAL_UNAVAILABLE'));
  await syncNow();
  const [one, two] = [await mockStore.vouchers.find('PAYER:vlt_1:1'), await mockStore.vouchers.find('PAYER:vlt_1:2')];
  const forged = [one, two].find(v => v?.stopped);
  const later = [one, two].find(v => !v?.stopped);
  expect(forged).toMatchObject({ status: 'REJECTED_CONFLICT', stopped: 'INVALID_SIGNATURE' });
  expect(later?.status).toBe('SIGNED');
  expect((await mockStore.vouchers.listUnsettled()).map(v => v.id)).toEqual([later?.id]);
});

it('updates a voucher the other phone settled, from the backend list', async () => {
  await mockStore.vouchers.save({ ...voucher(1, 'PAYEE'), status: 'ACKNOWLEDGED', voucherId: 'vch_1' });
  mockApi.submitVoucher.mockResolvedValueOnce({ voucherId: 'vch_1', status: 'SETTLING', paypalCaptureId: null, replay: true });
  mockApi.listVouchers.mockResolvedValueOnce({ items: [{ voucherId: 'vch_1', vaultId: 'vlt_1', sequence: 1, view: 'PAYEE', status: 'SETTLED', amountNgnMinor: 200_000, amountUsdMinor: 133, counterpartyName: 'Ada', paypalCaptureId: 'CAP-9', updatedAt: mockNow.toISOString() }], nextCursor: null } as never);
  await syncNow();
  expect(await mockStore.vouchers.find('PAYEE:vlt_1:1')).toMatchObject({ status: 'SETTLED', paypalCaptureId: 'CAP-9' });
});

it('melts with no tap once spend-by has passed and everything is uploaded', async () => {
  await mockStore.vouchers.save({ ...voucher(1), status: 'SETTLED', voucherId: 'vch_1' });
  await mockStore.vouchers.save({ ...voucher(2), status: 'SETTLED', voucherId: 'vch_2' });
  mockNow = new Date('2026-11-11T11:00:00.000Z');
  await syncNow();
  expect(mockApi.meltVault).toHaveBeenCalledTimes(1);
  const [vaultId, body, options] = mockApi.meltVault.mock.calls[0] as unknown as [string, { spendStatement: { payload: unknown } }, { idempotencyKey: string }];
  expect(vaultId).toBe('vlt_1');
  expect(body.spendStatement.payload).toMatchObject({ lastSequence: 2, totalIssuedUsdMinor: 266 });
  expect(options.idempotencyKey).toBe('k');
  expect((await mockStore.vaults.findCurrent())?.melt?.status).toBe('CLOSED');
});

it('waits to melt while a signed voucher has not reached the backend', async () => {
  await mockStore.vouchers.save(voucher(1));
  mockApi.submitVoucher.mockRejectedValue(new MockApiRequestError('NETWORK'));
  mockNow = new Date('2026-11-11T11:00:00.000Z');
  await syncNow();
  expect(mockApi.meltVault).not.toHaveBeenCalled();
});
