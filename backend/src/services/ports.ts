import type { LedgerEntry } from '@tpay/shared/contracts/api';
import type { ReceiptPayload, SignedEnvelope, VoucherPayload } from '@tpay/shared/contracts/messages';
import type { Language, VaultStatus, VoucherStatus } from '@tpay/shared/contracts/statuses';
import type { TransactionView } from '@tpay/shared/contracts/api';



export interface Device {
  id: string;
  keyId: string;
  publicKey: string;
  tokenHash: string;
  displayName: string;
  language: Language;
  payoutEmail: string;
  createdAt: Date;
  revokedAt: Date | null;
}


export interface IDeviceRepository {
  findById(id: string): Promise<Device | null>;
  findByKeyId(keyId: string): Promise<Device | null>;
  findByPublicKey(publicKey: string): Promise<Device | null>;
  findByTokenHash(tokenHash: string): Promise<Device | null>;
  save(device: Device): Promise<Device>;
}



export interface TransactionEvent extends Omit<TransactionView, 'transactionId' | 'occurredAt'> {
  id: string;
  deviceId: string;
  occurredAt: Date;
}

export interface TransactionPage {
  items: TransactionEvent[];
  nextCursor: string | null;
}

export interface ITransactionRepository {
  append(event: TransactionEvent): Promise<void>;
  listForDevice(deviceId: string, cursor: string | null, limit: number): Promise<TransactionPage>;
}


export interface Vault {
  id: string;
  deviceId: string;
  status: VaultStatus;
  amountNgnMinor: number;
  authorisedUsdMinor: number;
  fxRate: string;
  durationHours: number;
  paypalOrderId: string;
  paypalAuthorizationId: string | null;
  spendBy: Date | null;
  settleBy: Date | null;
  honorEndsAt: Date | null;
  declaredLastSequence: number | null;
  declaredTotalUsdMinor: number | null;
  releasedAt: Date | null;
  createdAt: Date;
}

export interface VaultLock {
  paypalAuthorizationId: string;
  spendBy: Date;
  settleBy: Date;
  honorEndsAt: Date;
}

export interface IVaultRepository {
  create(vault: Vault): Promise<boolean>;
  findById(id: string): Promise<Vault | null>;
  findByAuthorizationId(authorizationId: string): Promise<Vault | null>;
  findByOrderId(orderId: string): Promise<Vault | null>;
  findOpenForDevice(deviceId: string): Promise<Vault | null>;
  findDueForRelease(now: Date): Promise<Vault[]>;
  findDueForReauthorization(now: Date): Promise<Vault[]>;
  activate(id: string, lock: VaultLock): Promise<Vault | null>;
  abandon(id: string): Promise<void>;
}


export interface StoredResponse {
  status: number;
  body: unknown;
}

export type IdempotencyClaim =
  | { outcome: 'NEW' }
  | { outcome: 'REPLAY'; response: StoredResponse }
  | { outcome: 'CONFLICT' };

export interface IIdempotencyStore {
  claim(deviceId: string, key: string, requestHash: string): Promise<IdempotencyClaim>;
  complete(deviceId: string, key: string, response: StoredResponse): Promise<void>;
  release(deviceId: string, key: string): Promise<void>;
}


export interface CreateOrderInput {
  requestId: string;
  vaultId: string;
  amountUsdMinor: number;
  returnUrl: string;
  cancelUrl: string;
}

export interface PaymentOrder {
  orderId: string;
  approvalUrl: string;
}

export interface AuthorizeOrderInput {
  requestId: string;
  orderId: string;
}

export interface PaymentAuthorization {
  authorizationId: string;
  amountUsdMinor: number;
  expiresAt: Date | null;
}

export interface ReauthorizeInput {
  authorizationId: string;
  requestId: string;
  amountUsdMinor: number;
}

export type ReauthorizeResult =
  | { outcome: 'REAUTHORIZED'; authorizationId: string }
  | { outcome: 'REFUSED'; reason: string }
  | { outcome: 'RETRY' };

export interface CaptureInput {
  authorizationId: string;
  requestId: string;
  invoiceId: string;
  amountUsdMinor: number;
}

export type CaptureResult =
  | { outcome: 'COMPLETED' | 'PENDING'; captureId: string }
  | { outcome: 'BLOCKED'; reason: string }
  | { outcome: 'RETRY' };

export interface FindCaptureInput {
  orderId: string;
  invoiceId: string;
}

export type VoidResult = 'VOIDED' | 'ALREADY_CAPTURED';

export interface WebhookNotification {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export interface PayoutInput {
  senderBatchId: string;
  receiverEmail: string;
  amountUsdMinor: number;
}

export type PayoutResult =
  | { outcome: 'ACCEPTED'; batchId: string }
  | { outcome: 'REJECTED'; reason: string }
  | { outcome: 'RETRY' };

export type PayoutStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface IPaymentGateway {
  createOrder(input: CreateOrderInput): Promise<PaymentOrder>;
  authorizeOrder(input: AuthorizeOrderInput): Promise<PaymentAuthorization | null>;
  capture(input: CaptureInput): Promise<CaptureResult>;
  findCapture(input: FindCaptureInput): Promise<CaptureResult | null>;
  voidAuthorization(authorizationId: string): Promise<VoidResult>;
  reauthorize(input: ReauthorizeInput): Promise<ReauthorizeResult>;
  createPayout(input: PayoutInput): Promise<PayoutResult>;
  getPayoutStatus(batchId: string): Promise<PayoutStatus>;
  verifyWebhook(notification: WebhookNotification): Promise<boolean>;
  isReachable(): Promise<boolean>;
}


export type StoredVoucherStatus = Exclude<VoucherStatus, 'DRAFT' | 'SIGNED' | 'DELIVERED' | 'ACKNOWLEDGED'>;

export interface Voucher {
  id: string;
  vaultId: string;
  sequence: number;
  payloadHash: string;
  payload: VoucherPayload;
  signature: string;
  receipt: SignedEnvelope<ReceiptPayload> | null;
  payerDeviceId: string;
  payeeDeviceId: string;
  payerName: string;
  payeeName: string;
  amountNgnMinor: number;
  amountUsdMinor: number;
  status: StoredVoucherStatus;
  paypalCaptureId: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type VoucherChanges = Partial<Pick<
  Voucher, 'status' | 'paypalCaptureId' | 'attempts' | 'nextAttemptAt' | 'leaseUntil' | 'updatedAt'
>>;

export type VaultChanges = Partial<Pick<
  Vault,
  'status' | 'declaredLastSequence' | 'declaredTotalUsdMinor' | 'releasedAt' | 'paypalAuthorizationId' | 'honorEndsAt'
>>;

export type AlertType =
  | 'VOUCHER_CONFLICT'
  | 'VOUCHER_OVERSPEND'
  | 'STATEMENT_VIOLATION'
  | 'SETTLEMENT_BLOCKED'
  | 'PAYMENT_REVERSED'
  | 'REAUTHORIZATION_FAILED';

export interface Alert {
  id: string;
  type: AlertType;
  vaultId: string;
  voucherId: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
}

export interface LedgerRecord {
  id: string;
  deviceId: string;
  type: LedgerEntry['type'];
  amountUsdMinor: number;
  amountNgnMinor: number;
  voucherId: string | null;
  withdrawalId: string | null;
  paypalCaptureId: string | null;
  createdAt: Date;
}

export interface VaultSession {
  readonly vault: Vault;
  readonly vouchers: Voucher[];
  insertVoucher(voucher: Voucher): Promise<void>;
  updateVoucher(id: string, changes: VoucherChanges): Promise<Voucher>;
  updateVault(changes: VaultChanges): Promise<void>;
  addAlert(alert: Alert): Promise<void>;
  addLedgerEntry(entry: LedgerRecord): Promise<void>;
  addEvent(event: TransactionEvent): Promise<void>;
}

export interface VoucherPage {
  items: Voucher[];
  nextCursor: string | null;
}

export interface PayPalEventRecord {
  id: string;
  type: string;
  payload: unknown;
}

export interface IVoucherRepository {
  withVaultLock<T>(vaultId: string, work: (session: VaultSession) => Promise<T>): Promise<T>;
  findById(id: string): Promise<Voucher | null>;
  findByCaptureId(captureId: string): Promise<Voucher | null>;
  listForVault(vaultId: string): Promise<Voucher[]>;
  listForDevice(deviceId: string, cursor: string | null, limit: number): Promise<VoucherPage>;
  findDueForRetry(now: Date): Promise<Voucher[]>;
  pendingNgnForPayee(deviceId: string): Promise<number>;
  listLedgerForDevice(deviceId: string): Promise<LedgerRecord[]>;
  listAlerts(vaultId: string): Promise<Alert[]>;
  rememberEvent(event: PayPalEventRecord): Promise<boolean>;
  forgetEvent(eventId: string): Promise<void>;
}


export type WithdrawalStatus = PayoutStatus;

export interface Withdrawal {
  id: string;
  deviceId: string;
  receiverEmail: string;
  amountUsdMinor: number;
  amountNgnMinor: number;
  status: WithdrawalStatus;
  paypalBatchId: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WithdrawalChanges = Partial<Pick<
  Withdrawal, 'status' | 'paypalBatchId' | 'attempts' | 'nextAttemptAt' | 'updatedAt'
>>;

export interface WalletSession {
  readonly ledger: LedgerRecord[];
  insertWithdrawal(withdrawal: Withdrawal): Promise<void>;
  updateWithdrawal(id: string, changes: WithdrawalChanges): Promise<Withdrawal>;
  addLedgerEntry(entry: LedgerRecord): Promise<void>;
  addEvent(event: TransactionEvent): Promise<void>;
}

export interface IWalletRepository {
  withWalletLock<T>(deviceId: string, work: (session: WalletSession) => Promise<T>): Promise<T>;
  findWithdrawal(id: string): Promise<Withdrawal | null>;
  findDueWithdrawals(now: Date): Promise<Withdrawal[]>;
}
