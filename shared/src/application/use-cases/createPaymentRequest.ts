import { MESSAGE_PREFIX } from '../../contracts/messages';
import type {
  DeviceCertificatePayload, PaymentRequestPayload, SignedEnvelope,
} from '../../contracts/messages';
import { REFUSAL } from '../../contracts/refusals';
import { signMessage } from '../../domain/signedMessages';
import { Money } from '../../shared/domain/Money';
import { Result } from '../../shared/domain/Result';
import type { ISigner } from '../ports/crypto';
import type { IClock, IRandom } from '../ports/system';





// Long enough to hand a phone across a stall, short enough that an old QR on a
// screenshot stops working the same afternoon.
export const PAYMENT_REQUEST_LIFETIME_MS = 15 * 60 * 1000;

// The largest vault the backend will lock, so no request can ask for more.
export const MAX_REQUEST_NGN_MINOR = 1_000_000_000;


export interface CreatePaymentRequestInput {
  amountNgnMinor: number;
  merchantCertificate: SignedEnvelope<DeviceCertificatePayload>;
  merchantPrivateKey: string;
}


// ACT-06. The merchant signs what it wants to be paid. The customer's phone checks
// the signature and the certificate inside it, so neither can be changed later.
export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
  { signer, clock, random }: { signer: ISigner; clock: IClock; random: IRandom },
): Promise<Result<SignedEnvelope<PaymentRequestPayload>>> {
  const now = clock.now();
  const amount = Money.fromMinor(input.amountNgnMinor, 'NGN');
  if (amount.isFailure || amount.getValue().isZero() || input.amountNgnMinor > MAX_REQUEST_NGN_MINOR) {
    return Result.fail(REFUSAL.REQUEST_MISMATCH);
  }

  // An expired certificate would be refused by every customer, so renew first.
  const certificate = input.merchantCertificate.payload;
  if (new Date(certificate.expiresAt) <= now) {
    return Result.fail(REFUSAL.INVALID_CERTIFICATE);
  }

  const request = await signMessage<PaymentRequestPayload>(
    MESSAGE_PREFIX.PAYMENT_REQUEST,
    {
      requestId: `req_${random.uuid()}`,
      merchantKeyId: certificate.keyId,
      amountNgnMinor: amount.getValue().minor,
      nonce: random.nonce(),
      expiresAt: new Date(now.getTime() + PAYMENT_REQUEST_LIFETIME_MS).toISOString(),
      merchantCertificate: input.merchantCertificate,
    },
    input.merchantPrivateKey,
    signer,
  );
  return Result.ok(request);
}
