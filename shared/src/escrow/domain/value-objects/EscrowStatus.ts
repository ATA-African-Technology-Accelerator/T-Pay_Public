export const EscrowStatus = {
  OFFLINE_CREATED: 'OFFLINE_CREATED',
  PEER_ACKNOWLEDGED: 'PEER_ACKNOWLEDGED',
  SYNCING_TO_PAYPAL: 'SYNCING_TO_PAYPAL',
  PAYPAL_SETTLED: 'PAYPAL_SETTLED',
  FAILED: 'FAILED',
} as const;

export type EscrowStatus = (typeof EscrowStatus)[keyof typeof EscrowStatus];
