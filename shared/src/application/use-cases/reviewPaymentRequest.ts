import { MESSAGE_PREFIX } from '../../contracts/messages';
import type {
  PaymentRequestPayload, SignedEnvelope, VaultCertificatePayload,
} from '../../contracts/messages';
import { REFUSAL } from '../../contracts/refusals';
import { verifyDeviceCertificate, verifyVaultCertificate } from '../../domain/certificates';
import { convertNgnToUsd } from '../../domain/convertNgnToUsd';
import { verifyMessage } from '../../domain/signedMessages';
import type { VaultCapacity } from '../../domain/VaultCapacity';
import { Money } from '../../shared/domain/Money';
import { Result } from '../../shared/domain/Result';
import type { ISigner } from '../ports/crypto';
import type { IClock } from '../ports/system';





export interface RequestReview {
  merchantName: string;
  merchantKeyId: string;
  amountNgnMinor: number;
  amountUsdMinor: number;
  fxRate: string;
  remainingUsdMinor: number;
}


// ACT-07, before anything is signed: the same checks issueVoucher makes, so the
// customer sees who is asking and for how much, or why it can't be paid, with no
// signature in existence (FR-07). issueVoucher repeats every check when signing.
export async function reviewPaymentRequest(
  input: {
    request: SignedEnvelope<PaymentRequestPayload>;
    vaultCertificate: SignedEnvelope<VaultCertificatePayload>;
    capacity: VaultCapacity;
    customerKeyId: string;
    rootPublicKey: string;
  },
  { signer, clock }: { signer: ISigner; clock: IClock },
): Promise<Result<RequestReview>> {
  const now = clock.now();
  const { request, rootPublicKey } = input;
  const trust = { rootPublicKey, signer, now };

  const merchant = await verifyDeviceCertificate(request.payload.merchantCertificate, trust);
  if (merchant.isFailure) return Result.fail(merchant.error as string);

  const valid = await verifyMessage(MESSAGE_PREFIX.PAYMENT_REQUEST, request, merchant.getValue().publicKey, signer);
  if (!valid || request.payload.merchantKeyId !== merchant.getValue().keyId) {
    return Result.fail(REFUSAL.INVALID_SIGNATURE);
  }
  if (request.payload.merchantKeyId === input.customerKeyId) return Result.fail(REFUSAL.SELF_PAYMENT);
  if (new Date(request.payload.expiresAt) <= now) return Result.fail(REFUSAL.REQUEST_EXPIRED);

  const vault = await verifyVaultCertificate(input.vaultCertificate, input.customerKeyId, trust);
  if (vault.isFailure) return Result.fail(vault.error as string);
  if (new Date(vault.getValue().spendBy) <= now) return Result.fail(REFUSAL.VAULT_EXPIRED);

  const amount = Money.fromMinor(request.payload.amountNgnMinor, 'NGN');
  if (amount.isFailure) return Result.fail(REFUSAL.REQUEST_MISMATCH);
  const usd = convertNgnToUsd(amount.getValue(), vault.getValue().fxRate);
  if (usd.isFailure) return Result.fail(REFUSAL.REQUEST_MISMATCH);

  const after = input.capacity.reserve(usd.getValue());
  if (after.isFailure) return Result.fail(REFUSAL.INSUFFICIENT_VAULT_CAPACITY);

  return Result.ok({
    merchantName: merchant.getValue().displayName,
    merchantKeyId: merchant.getValue().keyId,
    amountNgnMinor: amount.getValue().minor,
    amountUsdMinor: usd.getValue().minor,
    fxRate: vault.getValue().fxRate,
    remainingUsdMinor: input.capacity.remaining.minor,
  });
}
