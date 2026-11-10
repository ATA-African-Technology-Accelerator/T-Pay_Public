import type {
  DeviceCertificatePayload, ReceiptPayload,
  SignedEnvelope, SpendStatementPayload,
  VaultCertificatePayload, VoucherPayload,
} from './messages';

import type { Language, VaultStatus, VoucherStatus } from './statuses';






export interface ApiSuccess<T> {
  data: T;
}

export type SignedDeviceCertificate = SignedEnvelope<DeviceCertificatePayload>;
export type SignedVaultCertificate = SignedEnvelope<VaultCertificatePayload>;

export interface RegisterDeviceRequest {
  publicKey: string;
  displayName: string;
  language: Language;
  payoutEmail: string;
  proof: string;
}


export interface RegisterDeviceResponse {
  deviceId: string;
  keyId: string;
  deviceToken: string;
  deviceCertificate: SignedDeviceCertificate;
  assuranceTier: 'B';
}


export interface ProfileView {
  deviceId: string;
  displayName: string;
  language: Language;
  payoutEmail: string;
  assuranceTier: 'B';
  createdAt: string;
}


export interface UpdateProfileRequest {
  displayName?: string;
  language?: Language;
  payoutEmail?: string;
}

export type TransactionType =
  | 'VAULT_LOCKED'
  | 'VAULT_RELEASED'
  | 'VOUCHER_SUBMITTED'
  | 'VOUCHER_SETTLED'
  | 'VOUCHER_REJECTED'
  | 'WITHDRAWAL_REQUESTED'
  | 'WITHDRAWAL_COMPLETED'
  | 'WITHDRAWAL_FAILED';

export interface TransactionView {
  transactionId: string;
  type: TransactionType;
  amountNgnMinor: number | null;
  amountUsdMinor: number | null;
  vaultId: string | null;
  voucherId: string | null;
  paypalReferenceId: string | null;
  occurredAt: string;
}


export interface ListTransactionsResponse {
  items: TransactionView[];
  nextCursor: string | null;
}


export interface CreateVaultRequest {
  amountNgnMinor: number;
  durationHours: number;
}


export interface CreateVaultResponse {
  vaultId: string;
  status: VaultStatus;
  amountNgnMinor: number;
  amountUsdMinor: number;
  fxRate: string;
  approvalUrl: string;
}


export interface VaultView {
  vaultId: string;
  status: VaultStatus;
  amountNgnMinor: number;
  fxRate: string;
  authorisedUsdMinor: number;
  reservedUsdMinor: number;
  settledUsdMinor: number;
  remainingUsdMinor: number;
  spendBy: string;
  settleBy: string;
  paypalAuthorizationId: string;
}


export interface AuthorizeVaultResponse {
  vault: VaultView;
  vaultCertificate: SignedVaultCertificate;
}


export interface CurrentVaultResponse {
  vault: VaultView | null;
}


export interface MeltVaultRequest {
  spendStatement: SignedEnvelope<SpendStatementPayload>;
}


export interface MeltVaultResponse {
  vaultId: string;
  status: VaultStatus;
  releasedAt: string | null;
  releaseScheduledFor: string | null;
  blockingVoucherIds: string[];
}


export interface SubmitVoucherRequest {
  voucher: SignedEnvelope<VoucherPayload>;
  vaultCertificate: SignedVaultCertificate;
  receipt?: SignedEnvelope<ReceiptPayload>;
}


export interface SubmitVoucherResponse {
  voucherId: string;
  status: VoucherStatus;
  paypalCaptureId: string | null;
  replay: boolean;
}

export interface VoucherView {
  voucherId: string;
  vaultId: string;
  sequence: number;
  view: 'PAYER' | 'PAYEE';
  status: VoucherStatus;
  amountNgnMinor: number;
  amountUsdMinor: number;
  counterpartyName: string;
  paypalCaptureId: string | null;
  updatedAt: string;
}


export interface ListVouchersResponse {
  items: VoucherView[];
  nextCursor: string | null;
}


export interface LedgerEntry {
  entryId: string;
  type: 'CREDIT' | 'WITHDRAWAL' | 'REVERSAL' | 'WITHDRAWAL_RETURNED';
  amountUsdMinor: number;
  amountNgnMinor: number;
  voucherId: string | null;
  paypalCaptureId: string | null;
  createdAt: string;
}


export interface ActiveWalletResponse {
  balanceUsdMinor: number;
  balanceNgnMinor: number;
  pendingNgnMinor: number;
  payoutEmail: string;
  entries: LedgerEntry[];
}


export interface WithdrawRequest {
  amountUsdMinor: number;
}


export interface WithdrawResponse {
  withdrawalId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  paypalBatchId: string | null;
}


export type AssistantIntent =
  | 'CREATE_PAYMENT_REQUEST'
  | 'PAY_AMOUNT'
  | 'RECORD_SALE'
  | 'CHECK_BALANCE'
  | 'UNKNOWN';

export interface InterpretRequest {
  text: string | null;
  audioBase64: string | null;
  audioMimeType: string | null;
  language: Language;
  context: { remainingNgnMinor: number; };
}


export interface InterpretResponse {
  proposal: {
    intent: AssistantIntent;
    amountNgnMinor: number | null;
    itemName: string | null;
  };
  transcript: string;
  spokenReply: string;
  needsConfirmation: true;
}