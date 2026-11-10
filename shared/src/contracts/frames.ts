import type {
  DeviceCertificatePayload, PaymentRequestPayload, ReceiptPayload,
  SignedEnvelope, VaultCertificatePayload, VoucherPayload,
} from './messages';



export const FRAME_VERSION = 'TPAY1';

export const FRAME_TYPE = {
  REQUEST: 'REQUEST',
  VOUCHER: 'VOUCHER',
  RECEIPT: 'RECEIPT',
} as const;

export type FrameType = (typeof FRAME_TYPE)[keyof typeof FRAME_TYPE];

// Longest text a phone will try to read. A real voucher frame is about 3 KB, so
// anything far larger is refused before it is parsed.
export const MAX_FRAME_LENGTH = 16_000;


export interface RequestFrame {
  type: typeof FRAME_TYPE.REQUEST;
  request: SignedEnvelope<PaymentRequestPayload>;
  // Sits outside the signed request on purpose. It only tells the customer's
  // phone which merchant to join over Bluetooth; a wrong or missing code can
  // stop that path, but never changes what is paid or to whom.
  sessionCode: string | null;
}

export interface VoucherFrame {
  type: typeof FRAME_TYPE.VOUCHER;
  voucher: SignedEnvelope<VoucherPayload>;
  customerCertificate: SignedEnvelope<DeviceCertificatePayload>;
  vaultCertificate: SignedEnvelope<VaultCertificatePayload>;
}

export interface ReceiptFrame {
  type: typeof FRAME_TYPE.RECEIPT;
  receipt: SignedEnvelope<ReceiptPayload>;
}

export type Frame = RequestFrame | VoucherFrame | ReceiptFrame;
