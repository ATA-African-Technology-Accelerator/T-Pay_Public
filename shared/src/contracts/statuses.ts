export type VaultStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SPEND_CLOSED' | 'CLOSED' | 'BLOCKED';

export type LocalVoucherStatus = 'DRAFT' | 'SIGNED' | 'DELIVERED';

export type SharedVoucherStatus = 'ACKNOWLEDGED' | 'SETTLING' | 'RETRYABLE_FAILURE';

export type TerminalVoucherStatus =
  | 'SETTLED'
  | 'SETTLEMENT_BLOCKED'
  | 'REJECTED_CONFLICT'
  | 'REJECTED_OVERSPEND';

export type VoucherStatus = LocalVoucherStatus | SharedVoucherStatus | TerminalVoucherStatus;

export type Language = 'en' | 'pcm' | 'yo' | 'ig' | 'ha';