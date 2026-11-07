import type { Language } from './statuses';



export const MESSAGE_PREFIX = {
  REGISTRATION: 'TPAY-REGISTER-V1',
  DEVICE_CERTIFICATE: 'TPAY-DEVICE-CERT-V1',
  VAULT_CERTIFICATE: 'TPAY-VAULT-CERT-V1',
  PAYMENT_REQUEST: 'TPAY-REQUEST-V1',
  VOUCHER: 'TPAY-VOUCHER-V1',
  RECEIPT: 'TPAY-RECEIPT-V1',
  SPEND_STATEMENT: 'TPAY-STATEMENT-V1',
} as const;


export interface SignedEnvelope<T> {
  payload: T;
  signature: string;
}


export interface RegistrationProofPayload {
  publicKey: string;
  displayName: string;
  language: Language;
  payoutEmail: string;
}


export interface DeviceCertificatePayload {
  deviceId: string;
  keyId: string;
  publicKey: string;
  displayName: string;
  expiresAt: string;
}

export interface VaultCertificatePayload {
  vaultId: string;
  keyId: string;
  authorisedUsdMinor: number;
  amountNgnMinor: number;
  fxRate: string;
  spendBy: string;
  settleBy: string;
}

export interface PaymentRequestPayload {
  requestId: string;
  merchantKeyId: string;
  amountNgnMinor: number;
  nonce: string;
  expiresAt: string;
  merchantCertificate: SignedEnvelope<DeviceCertificatePayload>;
}

export interface VoucherPayload {
  vaultId: string;
  keyId: string;
  deviceId: string;
  sequence: number;
  amountNgnMinor: number;
  amountUsdMinor: number;
  fxRate: string;
  payeeKeyId: string;
  requestNonce: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ReceiptPayload {
  vaultId: string;
  sequence: number;
  voucherHash: string;
  merchantKeyId: string;
  receivedAt: string;
}

export interface SpendStatementPayload {
  vaultId: string;
  lastSequence: number;
  totalIssuedUsdMinor: number;
  issuedAt: string;
}