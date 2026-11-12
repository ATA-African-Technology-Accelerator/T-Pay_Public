/// <reference types="jest" />
// A retry after a lost answer must reuse the key, so PayPal pays once; a different amount or
// a different recipient is a different payment and must not.
import { MemoryKv } from '../../../adapters/storage/kvCore';
import { LocalStore } from '../../../adapters/storage/localStore';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('expo-web-browser', () => ({}));
jest.mock('../../../session/guard', () => ({ withSession: (call: () => unknown) => call() }));
jest.mock('../../../sync/syncCoordinator', () => ({ refreshWallet: async () => undefined }));

const mockStore = new LocalStore(Promise.resolve(new MemoryKv()));
let mockCounter = 0;
const mockWithdraw = jest.fn();
const mockCreateDeposit = jest.fn();
const mockCompleteDeposit = jest.fn();
jest.mock('../../../composition', () => ({
  store: mockStore,
  api: {
    withdraw: (...args: unknown[]) => mockWithdraw(...args),
    createDeposit: (...args: unknown[]) => mockCreateDeposit(...args),
    completeDeposit: (...args: unknown[]) => mockCompleteDeposit(...args),
  },
  clock: { now: () => new Date('2026-11-10T10:00:00Z') },
  random: { uuid: () => `key-${++mockCounter}` },
}));

const { withdraw, startDeposit, completeDeposit, loadDeposit, readDepositReturn } = require('../walletActivities') as typeof import('../walletActivities');
const keyOf = (call: number) => (mockWithdraw.mock.calls[call] as [unknown, { idempotencyKey: string }])[1].idempotencyKey;
const bodyOf = (call: number) => (mockWithdraw.mock.calls[call] as [Record<string, unknown>])[0];

beforeEach(async () => { await mockStore.wipe(); mockWithdraw.mockReset(); mockCreateDeposit.mockReset(); mockCompleteDeposit.mockReset(); mockCounter = 0; });

it('sends to the account email by default, with no recipient field', async () => {
  mockWithdraw.mockResolvedValue({ withdrawalId: 'w1', status: 'PENDING', paypalBatchId: null });
  await withdraw(500, 750_000);
  expect(bodyOf(0)).toEqual({ amountUsdMinor: 500 });
});

it('sends to another email when one is given', async () => {
  mockWithdraw.mockResolvedValue({ withdrawalId: 'w1', status: 'PENDING', paypalBatchId: null });
  await withdraw(500, 750_000, 'chidi@example.com');
  expect(bodyOf(0)).toEqual({ amountUsdMinor: 500, recipientEmail: 'chidi@example.com' });
});

it('reuses the key when the same payment is repeated after a lost answer', async () => {
  mockWithdraw.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ withdrawalId: 'w1', status: 'PENDING', paypalBatchId: null });
  await expect(withdraw(500, 750_000, 'chidi@example.com')).rejects.toThrow('network');
  await withdraw(500, 750_000, 'chidi@example.com');
  expect(keyOf(1)).toBe(keyOf(0));
});

it('uses a new key for a different recipient or amount', async () => {
  mockWithdraw.mockRejectedValue(new Error('network'));
  await expect(withdraw(500, 750_000, 'a@example.com')).rejects.toThrow();
  await expect(withdraw(500, 750_000, 'b@example.com')).rejects.toThrow();
  await expect(withdraw(400, 600_000, 'b@example.com')).rejects.toThrow();
  expect(new Set([keyOf(0), keyOf(1), keyOf(2)]).size).toBe(3);
});


describe('Add money', () => {
  const order = { depositId: 'dep_1', amountNgnMinor: 1_500_000, amountUsdMinor: 1000, fxRate: '1500.00', approvalUrl: 'https://paypal.test/checkout' };
  const keyOfCreate = (call: number) => (mockCreateDeposit.mock.calls[call] as [unknown, { idempotencyKey: string }])[1].idempotencyKey;

  it('makes one checkout for an amount, even when the first answer is lost and it is tried again', async () => {
    mockCreateDeposit.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(order);
    await expect(startDeposit(1_500_000)).rejects.toThrow('network');
    await startDeposit(1_500_000);
    expect(keyOfCreate(1)).toBe(keyOfCreate(0));
    expect(await loadDeposit()).toMatchObject({ depositId: 'dep_1', amountNgnMinor: 1_500_000 });
  });

  it('uses a new checkout for a different amount', async () => {
    mockCreateDeposit.mockRejectedValue(new Error('network'));
    await expect(startDeposit(1_500_000)).rejects.toThrow();
    await expect(startDeposit(3_000_000)).rejects.toThrow();
    expect(keyOfCreate(1)).not.toBe(keyOfCreate(0));
  });

  it('completes with the same key every time, and forgets the checkout only once it is credited', async () => {
    mockCreateDeposit.mockResolvedValue(order);
    await startDeposit(1_500_000);
    mockCompleteDeposit
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ depositId: 'dep_1', status: 'PENDING', amountNgnMinor: 1_500_000, amountUsdMinor: 1000, paypalCaptureId: 'C' })
      .mockResolvedValueOnce({ depositId: 'dep_1', status: 'COMPLETED', amountNgnMinor: 1_500_000, amountUsdMinor: 1000, paypalCaptureId: 'C' });

    await expect(completeDeposit('dep_1')).rejects.toThrow('network');
    expect((await completeDeposit('dep_1')).status).toBe('PENDING');
    expect(await loadDeposit()).not.toBeNull();
    expect((await completeDeposit('dep_1')).status).toBe('COMPLETED');
    expect(await loadDeposit()).toBeNull();

    const keys = mockCompleteDeposit.mock.calls.map(c => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('reads the return link from PayPal, and ignores anything else', () => {
    expect(readDepositReturn('tpay://wallet/return?depositId=dep_1&outcome=approved')).toEqual({ depositId: 'dep_1', outcome: 'approved' });
    expect(readDepositReturn('tpay://wallet/return?depositId=dep_1&outcome=cancelled')).toEqual({ depositId: 'dep_1', outcome: 'cancelled' });
    expect(readDepositReturn('tpay://vault/return?vaultId=v&outcome=approved')).toBeNull();
    expect(readDepositReturn('tpay://wallet/return?depositId=dep_1&outcome=hacked')).toBeNull();
    expect(readDepositReturn('tpay://wallet/return?outcome=approved')).toBeNull();
  });
});
