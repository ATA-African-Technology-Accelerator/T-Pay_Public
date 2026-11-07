import type {
  ReceiptPayload, SignedEnvelope,
  VaultCertificatePayload, VoucherPayload,
} from '../../contracts/messages';
import type { VoucherStatus } from '../../contracts/statuses';





export interface LocalVault {
  certificate: SignedEnvelope<VaultCertificatePayload>;
  reservedUsdMinor: number;
  settledUsdMinor: number;
  nextSequence: number;
}


export interface LocalVoucher {
  voucher: SignedEnvelope<VoucherPayload>;
  receipt: SignedEnvelope<ReceiptPayload> | null;
  status: VoucherStatus;
  view: 'PAYER' | 'PAYEE';
  paypalCaptureId: string | null;
}


export interface ILocalVaultRepository {
  findCurrent(): Promise<LocalVault | null>;
  save(vault: LocalVault): Promise<void>;
}


export interface ILocalVoucherRepository {
  list(): Promise<LocalVoucher[]>;
  listUnsettled(): Promise<LocalVoucher[]>;
  save(voucher: LocalVoucher): Promise<void>;
}


export interface ISeenVoucherRepository {
  hasSeen(vaultId: string, sequence: number): Promise<boolean>;
  markSeen(vaultId: string, sequence: number): Promise<void>;
}