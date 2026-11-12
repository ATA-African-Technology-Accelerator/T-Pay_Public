import type {
  DeviceCertificatePayload, ReceiptPayload,
  SignedEnvelope, SpendStatementPayload,
  VaultCertificatePayload, VoucherPayload,
} from './messages';

import type { Language, VaultStatus, VoucherStatus } from './statuses';






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


/** GET /health: whether the server can reach its database and PayPal, and which PayPal it uses. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: 'ok' | 'down';
  paypal: 'ok' | 'down';
  mode: 'sandbox' | 'live';
}


export interface ProfileView {
  deviceId: string;
  displayName: string;
  language: Language;
  payoutEmail: string;
  /** Money received offline goes on to this PayPal email by itself. On unless turned off. */
  autoCashOut: boolean;
  assuranceTier: 'B';
  createdAt: string;
}


export interface UpdateProfileRequest {
  displayName?: string;
  language?: Language;
  payoutEmail?: string;
  autoCashOut?: boolean;
}

export type TransactionType =
  | 'VAULT_LOCKED'
  | 'VAULT_RELEASED'
  | 'VOUCHER_SUBMITTED'
  | 'VOUCHER_SETTLED'
  | 'VOUCHER_REJECTED'
  | 'WITHDRAWAL_REQUESTED'
  | 'WITHDRAWAL_COMPLETED'
  | 'WITHDRAWAL_FAILED'
  | 'DEPOSIT_COMPLETED'
  | 'PAYMENT_LINK_RECEIVED';

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
  /** Where the locked money came from: a PayPal hold, or the Online wallet. */
  fundedBy?: 'PAYPAL' | 'WALLET';
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
  /** The nonce of the payment request it pays, so the seller's phone can tell its own request was paid. */
  requestNonce?: string;
}


export interface ListVouchersResponse {
  items: VoucherView[];
  nextCursor: string | null;
}


export interface LedgerEntry {
  entryId: string;
  type: 'CREDIT' | 'WITHDRAWAL' | 'REVERSAL' | 'WITHDRAWAL_RETURNED' | 'DEPOSIT' | 'PAYMENT_LINK' | 'VAULT_LOCK' | 'VAULT_RETURN';
  amountUsdMinor: number;
  amountNgnMinor: number;
  voucherId: string | null;
  paypalCaptureId: string | null;
  createdAt: string;
  /** A withdrawal T-Pay made by itself, sending money received offline on to PayPal. */
  autoCashOut?: boolean;
}


export interface ActiveWalletResponse {
  balanceUsdMinor: number;
  balanceNgnMinor: number;
  pendingNgnMinor: number;
  payoutEmail: string;
  // The fixed demo rate, naira per dollar, so the app can turn an amount in naira into dollars.
  fxRate: string;
  entries: LedgerEntry[];
}


// A public link that lets anyone pay this account by PayPal, with no T-Pay on their side.
export interface PayLinkResponse {
  url: string;
}


// Add money: PayPal checkout that captures straight into the Online wallet.
export interface CreateDepositRequest {
  amountNgnMinor: number;
}


export interface CreateDepositResponse {
  depositId: string;
  amountNgnMinor: number;
  amountUsdMinor: number;
  fxRate: string;
  approvalUrl: string;
}


export interface CompleteDepositResponse {
  depositId: string;
  // PENDING means PayPal is still confirming; calling again reads the same capture.
  status: 'COMPLETED' | 'PENDING';
  amountNgnMinor: number;
  amountUsdMinor: number;
  paypalCaptureId: string | null;
}


export interface WithdrawRequest {
  amountUsdMinor: number;
  // Where the money goes. Left out, it goes to the account's own payout email. Any PayPal
  // email works, so people who aren't on T-Pay can be paid.
  recipientEmail?: string;
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
  | 'HELP'
  // Everything else a person can do with their hands. Each one only opens or fills a screen:
  // money still moves only after the PIN, fingerprint or PayPal sign-in on that screen.
  | 'LOCK_MONEY'
  | 'UNLOCK_MONEY'
  | 'ADD_MONEY'
  | 'WITHDRAW'
  | 'SHARE_PAY_LINK'
  | 'ADD_STOCK'
  | 'CHECK_STOCK'
  | 'SET_BUDGET'
  | 'CHECK_BUDGET'
  | 'OPEN_SCREEN'
  | 'UNKNOWN';

/** Where OPEN_SCREEN goes. */
export type AssistantScreen = 'HOME' | 'ACTIVITY' | 'WALLET' | 'VAULT' | 'STOCK' | 'BUDGET' | 'SETTINGS' | 'HELP';
export const ASSISTANT_SCREENS: readonly AssistantScreen[] = ['HOME', 'ACTIVITY', 'WALLET', 'VAULT', 'STOCK', 'BUDGET', 'SETTINGS', 'HELP'];

/** What a HELP question is about. The app answers it itself, from what the phone knows. */
export type HelpTopic = 'PAY' | 'GET_PAID' | 'LOCK' | 'WITHDRAW' | 'SAFETY' | 'WHAT_CAN_YOU_DO';
export const HELP_TOPICS: readonly HelpTopic[] = ['PAY', 'GET_PAID', 'LOCK', 'WITHDRAW', 'SAFETY', 'WHAT_CAN_YOU_DO'];

export interface InterpretRequest {
  text: string | null;
  audioBase64: string | null;
  audioMimeType: string | null;
  language: Language;
  context: { remainingNgnMinor: number; };
}


export interface SpeakRequest {
  text: string;
  language: Language;
}


/** A short spoken clip, base64: WAV (Gemini) or MP3 (ElevenLabs). */
export interface SpeakResponse {
  audioBase64: string;
  audioMimeType: 'audio/wav' | 'audio/mpeg';
}


export interface InterpretResponse {
  proposal: {
    intent: AssistantIntent;
    amountNgnMinor: number | null;
    itemName: string | null;
    /** Only on a HELP proposal. */
    helpTopic?: HelpTopic;
    /** Only on ADD_STOCK: how many came in. */
    quantity?: number | null;
    /** Only on OPEN_SCREEN. */
    screen?: AssistantScreen | null;
  };
  transcript: string;
  spokenReply: string;
  needsConfirmation: true;
}