import { MESSAGE_PREFIX } from '../../contracts/messages';
import type {
  PaymentRequestPayload, SignedEnvelope,
  VaultCertificatePayload, VoucherPayload,
} from '../../contracts/messages';
import { REFUSAL } from '../../contracts/refusals';
import { verifyDeviceCertificate, verifyVaultCertificate } from '../../domain/certificates';
import { convertNgnToUsd } from '../../domain/convertNgnToUsd';
import { signMessage, verifyMessage } from '../../domain/signedMessages';
import type { VaultCapacity } from '../../domain/VaultCapacity';
import { Money } from '../../shared/domain/Money';
import { Result } from '../../shared/domain/Result';
import type { ISigner } from '../ports/crypto';
import type { IClock } from '../ports/system';





export interface IssueVoucherInput {
  request: SignedEnvelope<PaymentRequestPayload>;
  vaultCertificate: SignedEnvelope<VaultCertificatePayload>;
  capacity: VaultCapacity;
  customerDeviceId: string;
  customerKeyId: string;
  customerPrivateKey: string;
  sequence: number;
  rootPublicKey: string;
}


export interface IssueVoucherOutput {
  voucher: SignedEnvelope<VoucherPayload>;
  capacity: VaultCapacity;
}


export async function issueVoucher(
  input: IssueVoucherInput,
  { signer, clock }: { signer: ISigner; clock: IClock },
): Promise<Result<IssueVoucherOutput>> {
  const now = clock.now();
  const { request, rootPublicKey } = input;
  const trust = { rootPublicKey, signer, now };

  const merchant = await verifyDeviceCertificate(
    request.payload.merchantCertificate,
    trust,
  );
  if (merchant.isFailure) return Result.fail(merchant.error as string);

  const requestIsValid = await verifyMessage(
    MESSAGE_PREFIX.PAYMENT_REQUEST,
    request,
    merchant.getValue().publicKey,
    signer,
  );
  
  if (!requestIsValid || request.payload.merchantKeyId !== merchant.getValue().keyId) {
    return Result.fail(REFUSAL.INVALID_SIGNATURE);
  }

  if (request.payload.merchantKeyId === input.customerKeyId) {
    return Result.fail(REFUSAL.SELF_PAYMENT);
  }

  if (new Date(request.payload.expiresAt) <= now) {
    return Result.fail(REFUSAL.REQUEST_EXPIRED);
  }

  const vault = await verifyVaultCertificate(input.vaultCertificate, input.customerKeyId, trust);
  if (vault.isFailure) return Result.fail(vault.error as string);
  if (new Date(vault.getValue().spendBy) <= now) {
    return Result.fail(REFUSAL.VAULT_EXPIRED);
  }

  const amount = Money.fromMinor(request.payload.amountNgnMinor, 'NGN');
  if (amount.isFailure) return Result.fail(amount.error as string);

  const amountUsd = convertNgnToUsd(amount.getValue(), vault.getValue().fxRate);
  if (amountUsd.isFailure) return Result.fail(amountUsd.error as string);

  const capacity = input.capacity.reserve(amountUsd.getValue());
  if (capacity.isFailure) return Result.fail(capacity.error as string);

  const voucher = await signMessage<VoucherPayload>(
    MESSAGE_PREFIX.VOUCHER,
    {
      vaultId: vault.getValue().vaultId,
      keyId: input.customerKeyId,
      deviceId: input.customerDeviceId,
      sequence: input.sequence,
      amountNgnMinor: amount.getValue().minor,
      amountUsdMinor: amountUsd.getValue().minor,
      fxRate: vault.getValue().fxRate,
      payeeKeyId: request.payload.merchantKeyId,
      requestNonce: request.payload.nonce,
      issuedAt: now.toISOString(),
      expiresAt: vault.getValue().spendBy,
    },
    input.customerPrivateKey,
    signer,
  );

  return Result.ok({ voucher, capacity: capacity.getValue() });
}