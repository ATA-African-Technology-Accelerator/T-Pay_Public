// ACT-06 to ACT-09. None of these waits for a network call: everything is checked with
// the shared rules and saved on the phone. Every transport carries the same frame text,
// so QR, the copyable code and Bluetooth behave identically.
import { acceptReceipt } from '@tpay/shared/application/use-cases/acceptReceipt';
import { acceptVoucher } from '@tpay/shared/application/use-cases/acceptVoucher';
import { createPaymentRequest } from '@tpay/shared/application/use-cases/createPaymentRequest';
import { issueVoucher } from '@tpay/shared/application/use-cases/issueVoucher';
import { reviewPaymentRequest, type RequestReview } from '@tpay/shared/application/use-cases/reviewPaymentRequest';
import { FRAME_TYPE } from '@tpay/shared/contracts/frames';
import type { PaymentRequestPayload, SignedEnvelope } from '@tpay/shared/contracts/messages';
import { REFUSAL, type Refusal } from '@tpay/shared/contracts/refusals';
import { decodeFrame, encodeFrame } from '@tpay/shared/domain/frames';
import { DuplicateVoucher, voucherKey, type AppVoucher } from '../../adapters/storage/localStore';
import { clock, keyStore, random, signer, store } from '../../composition';
import { config } from '../../config';
import { sessionStore, type DeviceSession } from '../../session/sessionStore';
import { canSign, capacityOf } from '../vault/vaultActivities';

/** A refusal the screen explains, or a reason specific to this phone. */
export type PaymentRefusal = Refusal | 'NO_VAULT' | 'NOT_REGISTERED';
export type Outcome<T> = { ok: true; value: T } | { ok: false; code: PaymentRefusal; existing?: AppVoucher };

const ok = <T,>(value: T): Outcome<T> => ({ ok: true, value });
const no = <T,>(code: PaymentRefusal, existing?: AppVoucher): Outcome<T> => ({ ok: false, code, existing });
const asRefusal = (error: string | null): PaymentRefusal =>
  (Object.values(REFUSAL) as string[]).includes(error ?? '') ? (error as Refusal) : REFUSAL.INVALID_FRAME;

async function identity(): Promise<{ session: DeviceSession; handle: string } | null> {
  const [session, handle] = await Promise.all([sessionStore.load(), keyStore.loadPrivateKey()]);
  return session && handle ? { session, handle } : null;
}

// ---- Merchant ----------------------------------------------------------------

export interface OpenRequest {
  request: SignedEnvelope<PaymentRequestPayload>;
  /** The QR and copy-code text. Carries the Bluetooth session code when hosting. */
  frame: string;
  sessionCode: string | null;
}

/** ACT-06. The session code is added only when Bluetooth is ready to host. */
export async function createRequest(amountNgnMinor: number, bluetooth: boolean): Promise<Outcome<OpenRequest>> {
  const me = await identity();
  if (!me) return no('NOT_REGISTERED');
  const signed = await createPaymentRequest(
    { amountNgnMinor, merchantCertificate: me.session.deviceCertificate, merchantPrivateKey: me.handle },
    { signer, clock, random },
  );
  if (signed.isFailure) return no(asRefusal(signed.error));
  const sessionCode = bluetooth ? random.nonce() : null;
  const frame = encodeFrame({ type: FRAME_TYPE.REQUEST, request: signed.getValue(), sessionCode });
  return ok({ request: signed.getValue(), frame, sessionCode });
}

/**
 * ACT-08. Verify, refuse a repeat, save, and sign the receipt. The pending credit
 * shows at once; only the backend later says it is settled.
 */
export async function takeVoucher(text: string, open: OpenRequest): Promise<Outcome<AppVoucher>> {
  const me = await identity();
  if (!me) return no('NOT_REGISTERED');
  const decoded = decodeFrame(text);
  if (decoded.isFailure) return no(REFUSAL.INVALID_FRAME);
  const frame = decoded.getValue();
  if (frame.type !== FRAME_TYPE.VOUCHER) return no(REFUSAL.INVALID_FRAME);

  const { vaultId, sequence } = frame.voucher.payload;
  const id = voucherKey('PAYEE', vaultId, sequence);
  const alreadySeen = await store.seen.hasSeen(vaultId, sequence);
  const receipt = await acceptVoucher({
    voucher: frame.voucher,
    vaultCertificate: frame.vaultCertificate,
    customerCertificate: frame.customerCertificate,
    request: open.request.payload,
    merchantKeyId: me.session.keyId,
    merchantPrivateKey: me.handle,
    alreadySeen,
    rootPublicKey: config.rootPublicKey,
  }, { signer, clock });
  if (receipt.isFailure) {
    const code = asRefusal(receipt.error);
    return no(code, code === REFUSAL.DUPLICATE_VOUCHER ? (await store.vouchers.find(id)) ?? undefined : undefined);
  }

  const now = clock.now().toISOString();
  const voucher: AppVoucher = {
    id,
    voucher: frame.voucher,
    receipt: receipt.getValue(),
    status: 'ACKNOWLEDGED',
    view: 'PAYEE',
    paypalCaptureId: null,
    vaultCertificate: frame.vaultCertificate,
    request: open.request.payload,
    frame: encodeFrame({ type: FRAME_TYPE.RECEIPT, receipt: receipt.getValue() }),
    counterparty: frame.customerCertificate.payload.displayName,
    voucherId: null,
    stopped: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await store.recordAccepted(voucher);
  } catch (e) {
    if (e instanceof DuplicateVoucher) return no(REFUSAL.DUPLICATE_VOUCHER, (await store.vouchers.find(id)) ?? undefined);
    throw e;
  }
  return ok(voucher);
}

// ---- Customer ----------------------------------------------------------------

export interface ScannedRequest {
  request: SignedEnvelope<PaymentRequestPayload>;
  sessionCode: string | null;
  review: RequestReview;
}

/** ACT-07, before signing: who is asking, for how much, and whether it can be paid. */
export async function readRequest(text: string): Promise<Outcome<ScannedRequest>> {
  const decoded = decodeFrame(text);
  if (decoded.isFailure) return no(REFUSAL.INVALID_FRAME);
  const frame = decoded.getValue();
  if (frame.type !== FRAME_TYPE.REQUEST) return no(REFUSAL.INVALID_FRAME);
  const me = await identity();
  if (!me) return no('NOT_REGISTERED');
  const vault = await store.vaults.findCurrent();
  if (!canSign(vault)) return no(vault ? REFUSAL.VAULT_EXPIRED : 'NO_VAULT');

  const review = await reviewPaymentRequest({
    request: frame.request,
    vaultCertificate: vault.certificate,
    capacity: capacityOf(vault, await store.vouchers.list()),
    customerKeyId: me.session.keyId,
    rootPublicKey: config.rootPublicKey,
  }, { signer, clock });
  if (review.isFailure) return no(asRefusal(review.error));
  return ok({ request: frame.request, sessionCode: frame.sessionCode, review: review.getValue() });
}

/**
 * ACT-07, on Pay. Signs once. The voucher and the sequence it used are saved together
 * before the frame is shown or sent, and a retry resends these exact bytes (FR-38).
 */
export async function pay(scanned: ScannedRequest): Promise<Outcome<AppVoucher>> {
  const me = await identity();
  if (!me) return no('NOT_REGISTERED');
  const vault = await store.vaults.findCurrent();
  if (!canSign(vault)) return no(vault ? REFUSAL.VAULT_EXPIRED : 'NO_VAULT');
  const vouchers = await store.vouchers.list();

  const issued = await issueVoucher({
    request: scanned.request,
    vaultCertificate: vault.certificate,
    capacity: capacityOf(vault, vouchers),
    customerDeviceId: me.session.deviceId,
    customerKeyId: me.session.keyId,
    customerPrivateKey: me.handle,
    sequence: vault.nextSequence,
    rootPublicKey: config.rootPublicKey,
  }, { signer, clock });
  if (issued.isFailure) return no(asRefusal(issued.error));

  const { voucher, capacity } = issued.getValue();
  const now = clock.now().toISOString();
  const record: AppVoucher = {
    id: voucherKey('PAYER', vault.vaultId, vault.nextSequence),
    voucher,
    receipt: null,
    status: 'SIGNED',
    view: 'PAYER',
    paypalCaptureId: null,
    vaultCertificate: vault.certificate,
    request: scanned.request.payload,
    frame: encodeFrame({
      type: FRAME_TYPE.VOUCHER, voucher, customerCertificate: me.session.deviceCertificate, vaultCertificate: vault.certificate,
    }),
    counterparty: scanned.review.merchantName,
    voucherId: null,
    stopped: null,
    createdAt: now,
    updatedAt: now,
  };
  await store.recordIssued({
    ...vault,
    nextSequence: vault.nextSequence + 1,
    reservedUsdMinor: capacity.reserved.minor,
    settledUsdMinor: capacity.settled.minor,
  }, record);
  return ok(record);
}

/** ACT-09. The receipt must come from this merchant and cover exactly this voucher. */
export async function takeReceipt(text: string, voucherId: string): Promise<Outcome<AppVoucher>> {
  const decoded = decodeFrame(text);
  if (decoded.isFailure) return no(REFUSAL.INVALID_FRAME);
  const frame = decoded.getValue();
  if (frame.type !== FRAME_TYPE.RECEIPT) return no(REFUSAL.INVALID_FRAME);
  const mine = await store.vouchers.find(voucherId);
  if (!mine?.request) return no(REFUSAL.REQUEST_MISMATCH);
  const checked = await acceptReceipt({ receipt: frame.receipt, voucher: mine.voucher, request: mine.request }, { signer });
  if (checked.isFailure) return no(asRefusal(checked.error));
  // The backend may already have moved it further; a receipt never moves it back.
  const status = mine.status === 'SIGNED' ? 'DELIVERED' : mine.status;
  const updated = { ...mine, receipt: checked.getValue(), status, updatedAt: clock.now().toISOString() } as AppVoucher;
  await store.vouchers.save(updated);
  return ok(updated);
}
