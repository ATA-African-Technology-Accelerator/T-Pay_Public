import type { Device, TransactionEvent, Vault } from '../../src/services/ports';




export const device = (name: string, overrides: Partial<Device> = {}): Device => ({
  id: `dev_${name}`,
  keyId: `key_${name}`,
  publicKey: `public_${name}`,
  tokenHash: `hash_${name}`,
  displayName: 'Mama Nkechi Provisions',
  language: 'pcm',
  payoutEmail: 'seller-sandbox@example.com',
  createdAt: new Date('2026-11-06T10:00:00.000Z'),
  revokedAt: null,
  ...overrides,
});

export const transaction = (
  id: string,
  deviceId: string,
  overrides: Partial<TransactionEvent> = {},
): TransactionEvent => ({
  id,
  deviceId,
  type: 'VOUCHER_SETTLED',
  amountNgnMinor: 200_000,
  amountUsdMinor: 133,
  vaultId: 'vlt_1',
  voucherId: 'vch_1',
  paypalReferenceId: 'SANDBOX-CAPTURE',
  occurredAt: new Date('2026-11-06T10:00:00.000Z'),
  ...overrides,
});

export const vault = (name: string, deviceId: string, overrides: Partial<Vault> = {}): Vault => ({
  id: `vlt_${name}`,
  deviceId,
  status: 'PENDING_APPROVAL',
  amountNgnMinor: 1_000_000,
  authorisedUsdMinor: 667,
  fxRate: '1500.00',
  durationHours: 24,
  paypalOrderId: `ORDER-${name}`,
  paypalAuthorizationId: null,
  spendBy: null,
  settleBy: null,
  declaredLastSequence: null,
  declaredTotalUsdMinor: null,
  releasedAt: null,
  createdAt: new Date('2026-11-06T10:00:00.000Z'),
  ...overrides,
});
