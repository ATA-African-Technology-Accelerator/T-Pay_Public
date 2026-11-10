import { MESSAGE_PREFIX } from '../../contracts/messages';
import type {
  PaymentRequestPayload, ReceiptPayload, SignedEnvelope, VoucherPayload,
} from '../../contracts/messages';
import { REFUSAL } from '../../contracts/refusals';
import { canonicalJson } from '../../domain/canonicalJson';
import { verifyMessage } from '../../domain/signedMessages';
import { Result } from '../../shared/domain/Result';
import type { ISigner } from '../ports/crypto';





// ACT-09. The customer's phone checks that the receipt comes from the merchant it
// paid and covers exactly the voucher it signed. The merchant's public key comes
// from the certificate in the payment request, already checked in ACT-07.
export async function acceptReceipt(
  input: {
    receipt: SignedEnvelope<ReceiptPayload>;
    voucher: SignedEnvelope<VoucherPayload>;
    request: PaymentRequestPayload;
  },
  { signer }: { signer: ISigner },
): Promise<Result<SignedEnvelope<ReceiptPayload>>> {
  const { receipt, voucher, request } = input;
  const merchant = request.merchantCertificate.payload;
  const payload = receipt.payload;

  const matches = payload.vaultId === voucher.payload.vaultId
    && payload.sequence === voucher.payload.sequence
    && payload.merchantKeyId === voucher.payload.payeeKeyId
    && payload.merchantKeyId === merchant.keyId
    && payload.voucherHash === await signer.hash(canonicalJson(voucher));
  if (!matches) return Result.fail(REFUSAL.REQUEST_MISMATCH);

  const valid = await verifyMessage(MESSAGE_PREFIX.RECEIPT, receipt, merchant.publicKey, signer);
  return valid ? Result.ok(receipt) : Result.fail(REFUSAL.INVALID_SIGNATURE);
}
