import { MESSAGE_PREFIX } from '../../contracts/messages';
import type {
  DeviceCertificatePayload, PaymentRequestPayload, ReceiptPayload,
  SignedEnvelope, VaultCertificatePayload, VoucherPayload,
} from '../../contracts/messages';
import { REFUSAL } from '../../contracts/refusals';
import { canonicalJson } from '../../domain/canonicalJson';
import { convertNgnToUsd } from '../../domain/convertNgnToUsd';
import { verifyDeviceCertificate, verifyVaultCertificate } from '../../domain/certificates';
import { signMessage, verifyMessage } from '../../domain/signedMessages';
import { Money } from '../../shared/domain/Money';
import { Result } from '../../shared/domain/Result';
import type { ISigner } from '../ports/crypto';
import type { IClock } from '../ports/system';





export interface AcceptVoucherInput {
  voucher: SignedEnvelope<VoucherPayload>;
  vaultCertificate: SignedEnvelope<VaultCertificatePayload>;
  customerCertificate: SignedEnvelope<DeviceCertificatePayload>;
  request: PaymentRequestPayload;
  merchantKeyId: string;
  merchantPrivateKey: string;
  alreadySeen: boolean;
  rootPublicKey: string;
}


export async function acceptVoucher(
  input: AcceptVoucherInput,
  { signer, clock }: { signer: ISigner; clock: IClock },
): Promise<Result<SignedEnvelope<ReceiptPayload>>> {
  const now = clock.now();
  const { voucher, rootPublicKey } = input;
  const payload = voucher.payload;
  const trust = { rootPublicKey, signer, now };

  const customer = await verifyDeviceCertificate(input.customerCertificate, trust);
  if (customer.isFailure) return Result.fail(customer.error as string);

  const vault = await verifyVaultCertificate(input.vaultCertificate, customer.getValue().keyId, trust);
  if (vault.isFailure) return Result.fail(vault.error as string);

  const voucherIsValid = await verifyMessage(
    MESSAGE_PREFIX.VOUCHER,
    voucher,
    customer.getValue().publicKey,
    signer,
  );
  if (!voucherIsValid || payload.keyId !== customer.getValue().keyId) {
    return Result.fail(REFUSAL.INVALID_SIGNATURE);
  }

  const refusal = findVoucherRefusal(input, vault.getValue(), now);
  if (refusal) return Result.fail(refusal);

  const receipt = await signMessage<ReceiptPayload>(
    MESSAGE_PREFIX.RECEIPT,
    {
      vaultId: payload.vaultId,
      sequence: payload.sequence,
      voucherHash: await signer.hash(canonicalJson(voucher)),
      merchantKeyId: input.merchantKeyId,
      receivedAt: now.toISOString(),
    },
    input.merchantPrivateKey,
    signer,
  );

  return Result.ok(receipt);
}


function findVoucherRefusal(
  { voucher, request, merchantKeyId, alreadySeen }: AcceptVoucherInput,
  vault: VaultCertificatePayload,
  now: Date,
): string | null {
  const payload = voucher.payload;

  if (payload.vaultId !== vault.vaultId || payload.fxRate !== vault.fxRate) {
    return REFUSAL.INVALID_CERTIFICATE;
  }
  if (payload.payeeKeyId !== merchantKeyId) return REFUSAL.WRONG_PAYEE;
  if (payload.payeeKeyId === payload.keyId) return REFUSAL.SELF_PAYMENT;
  if (payload.requestNonce !== request.nonce || payload.amountNgnMinor !== request.amountNgnMinor) {
    return REFUSAL.REQUEST_MISMATCH;
  }
  if (!matchesRate(payload, vault.fxRate)) return REFUSAL.REQUEST_MISMATCH;
  if (new Date(vault.spendBy) <= now || new Date(payload.expiresAt) <= now) {
    return REFUSAL.VAULT_EXPIRED;
  }
  if (payload.amountUsdMinor > vault.authorisedUsdMinor) {
    return REFUSAL.INSUFFICIENT_VAULT_CAPACITY;
  }
  if (alreadySeen) return REFUSAL.DUPLICATE_VOUCHER;
  return null;
}


function matchesRate(payload: VoucherPayload, fxRate: string): boolean {
  const amount = Money.fromMinor(payload.amountNgnMinor, 'NGN');
  if (amount.isFailure) return false;
  const converted = convertNgnToUsd(amount.getValue(), fxRate);
  return converted.isSuccess && converted.getValue().minor === payload.amountUsdMinor;
}
