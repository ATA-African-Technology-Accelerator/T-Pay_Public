import { beforeAll, describe, expect, it } from 'vitest';
import { issueVoucher } from '@tpay/shared/application/use-cases/issueVoucher';
import { FRAME_TYPE, MAX_FRAME_LENGTH } from '@tpay/shared/contracts/frames';
import type { RequestFrame, VoucherFrame } from '@tpay/shared/contracts/frames';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type { PaymentRequestPayload, ReceiptPayload, SignedEnvelope } from '@tpay/shared/contracts/messages';
import { REFUSAL } from '@tpay/shared/contracts/refusals';
import { decodeFrame, encodeFrame, isSessionCode } from '@tpay/shared/domain/frames';
import { signMessage, verifyMessage } from '@tpay/shared/domain/signedMessages';
import { capacity, clock, createOfflineFixture, signer } from '../support/offlineFixture';





type Fixture = Awaited<ReturnType<typeof createOfflineFixture>>;

const SESSION_CODE = 'k3Jx9QmZ_aB-7rT2pLw0';
const toBase64Url = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Node ignores the unused low bits of the last character, so a second spelling
// of the same bytes would decode. Pad the JSON until there are spare bits, then set one.
function withSpareBits(json: string): string {
  let text = json;
  while (toBase64Url(text).length % 4 === 0) text += ' ';
  const encoded = toBase64Url(text);
  const last = ALPHABET.indexOf(encoded.at(-1) as string);
  return encoded.slice(0, -1) + ALPHABET[last + 1];
}


describe('frames', () => {
  let fixture: Fixture;
  let request: SignedEnvelope<PaymentRequestPayload>;
  let voucherFrame: VoucherFrame;
  let receipt: SignedEnvelope<ReceiptPayload>;

  beforeAll(async () => {
    fixture = await createOfflineFixture();
    request = await fixture.paymentRequest();
    const issued = await issueVoucher(
      {
        request,
        vaultCertificate: fixture.vaultCertificate,
        capacity: capacity(667),
        customerDeviceId: 'dev_customer',
        customerKeyId: 'key_customer',
        customerPrivateKey: fixture.customerKeys.privateKey,
        sequence: 1,
        rootPublicKey: fixture.root.publicKey,
      },
      { signer, clock },
    );
    voucherFrame = {
      type: FRAME_TYPE.VOUCHER,
      voucher: issued.getValue().voucher,
      customerCertificate: fixture.customerCertificate,
      vaultCertificate: fixture.vaultCertificate,
    };
    receipt = await signMessage(
      MESSAGE_PREFIX.RECEIPT,
      {
        vaultId: 'vlt_1',
        sequence: 1,
        voucherHash: 'hash_1',
        merchantKeyId: 'key_merchant',
        receivedAt: '2026-11-06T10:01:00.000Z',
      },
      fixture.merchantKeys.privateKey,
      signer,
    );
  });

  const requestFrame = (sessionCode: string | null = SESSION_CODE): RequestFrame => ({
    type: FRAME_TYPE.REQUEST,
    request,
    sessionCode,
  });


  describe('encodeFrame and decodeFrame', () => {
    it('round-trips a payment request with its Bluetooth session code', () => {
      const text = encodeFrame(requestFrame());

      expect(text.startsWith('TPAY1:REQUEST:')).toBe(true);
      expect(text.endsWith(`:${SESSION_CODE}`)).toBe(true);
      expect(decodeFrame(text).getValue()).toEqual(requestFrame());
    });

    it('round-trips a payment request with no session code, for QR only', () => {
      const text = encodeFrame(requestFrame(null));

      expect(text.split(':')).toHaveLength(3);
      expect(decodeFrame(text).getValue()).toEqual(requestFrame(null));
    });

    it('round-trips a voucher with both certificates', () => {
      const text = encodeFrame(voucherFrame);

      expect(text.startsWith('TPAY1:VOUCHER:')).toBe(true);
      expect(decodeFrame(text).getValue()).toEqual(voucherFrame);
    });

    it('round-trips a receipt', () => {
      const frame = { type: FRAME_TYPE.RECEIPT, receipt } as const;

      expect(decodeFrame(encodeFrame(frame)).getValue()).toEqual(frame);
    });

    it('gives the same text every time, whatever the property order', () => {
      const reordered: VoucherFrame = {
        vaultCertificate: voucherFrame.vaultCertificate,
        customerCertificate: voucherFrame.customerCertificate,
        voucher: { signature: voucherFrame.voucher.signature, payload: voucherFrame.voucher.payload },
        type: FRAME_TYPE.VOUCHER,
      };
      const text = encodeFrame(voucherFrame);

      expect(encodeFrame(reordered)).toBe(text);
      expect(encodeFrame(decodeFrame(text).getValue())).toBe(text);
    });

    it('keeps the session code outside the signature, so the request still verifies', async () => {
      const decoded = decodeFrame(encodeFrame(requestFrame())).getValue() as RequestFrame;

      expect('sessionCode' in decoded.request.payload).toBe(false);
      await expect(verifyMessage(
        MESSAGE_PREFIX.PAYMENT_REQUEST,
        decoded.request,
        fixture.merchantKeys.publicKey,
        signer,
      )).resolves.toBe(true);
    });

    it('keeps Yoruba, Igbo and Hausa letters intact', async () => {
      const name = 'Ìyá Ọlá · Ụ̀lọ̀ · Ɗanjuma 🛒';
      const named = await fixture.paymentRequest({
        merchantCertificate: { ...request.payload.merchantCertificate, payload: {
          ...request.payload.merchantCertificate.payload, displayName: name,
        } },
      });
      const decoded = decodeFrame(encodeFrame({ ...requestFrame(), request: named })).getValue() as RequestFrame;

      expect(decoded.request.payload.merchantCertificate.payload.displayName).toBe(name);
    });

    it('uses only characters that survive QR codes, copy and paste, and Bluetooth', () => {
      expect(encodeFrame(voucherFrame)).toMatch(/^[A-Za-z0-9_:-]+$/);
    });

    it('ignores spaces and line breaks added by copy and paste', () => {
      expect(decodeFrame(`  ${encodeFrame(voucherFrame)}\n`).isSuccess).toBe(true);
    });

    it('refuses to encode a malformed session code', () => {
      expect(() => encodeFrame(requestFrame('too short'))).toThrow('A session code must be');
    });
  });


  describe('decodeFrame refusals', () => {
    const valid = () => encodeFrame(voucherFrame);
    const body = (value: unknown) => `TPAY1:VOUCHER:${toBase64Url(JSON.stringify(value))}`;

    it.each([
      ['empty text', () => ''],
      ['another app\'s QR code', () => 'https://example.com/pay'],
      ['a future frame version', () => valid().replace('TPAY1:', 'TPAY2:')],
      ['an unknown frame type', () => valid().replace(':VOUCHER:', ':REFUND:')],
      ['a missing body', () => 'TPAY1:VOUCHER'],
      ['a session code on a voucher', () => `${valid()}:${SESSION_CODE}`],
      ['a malformed session code', () => `${encodeFrame(requestFrame(null))}:bad code!`],
      ['extra segments', () => `${encodeFrame(requestFrame())}:extra`],
      ['a body that is not base64url', () => 'TPAY1:VOUCHER:not+base64/'],
      ['base64url with non-zero spare bits', () => `TPAY1:RECEIPT:${withSpareBits(JSON.stringify(receipt))}`],
      ['a body that is not JSON', () => `TPAY1:VOUCHER:${toBase64Url('not json')}`],
      ['invalid UTF-8', () => `TPAY1:VOUCHER:${Buffer.from([0x7b, 0xc0, 0xaf, 0x7d]).toString('base64url')}`],
      ['a JSON array', () => body([])],
      ['a voucher without its vault certificate', () => body({
        voucher: voucherFrame.voucher,
        customerCertificate: voucherFrame.customerCertificate,
      })],
      ['a voucher with an extra field', () => body({ ...JSON.parse(JSON.stringify(voucherFrame)), type: undefined, extra: 1 })],
      ['an envelope without a signature', () => body({
        ...voucherFrame,
        type: undefined,
        voucher: { payload: voucherFrame.voucher.payload },
      })],
      ['an envelope with an empty signature', () => `TPAY1:RECEIPT:${toBase64Url(JSON.stringify({
        payload: receipt.payload,
        signature: '',
      }))}`],
      ['text longer than any real frame', () => `TPAY1:VOUCHER:${'A'.repeat(MAX_FRAME_LENGTH)}`],
    ])('refuses %s', (_label, text) => {
      const result = decodeFrame(text());

      expect(result.isFailure).toBe(true);
      expect(result.error).toBe(REFUSAL.INVALID_FRAME);
    });
  });


  describe('isSessionCode', () => {
    it('accepts the base64url values IRandom.nonce() produces', () => {
      expect(isSessionCode('m1W4c7mJ0S3t2kPq8yXoZr5nB6vDfEaGhLiUjQwTsYc')).toBe(true);
    });

    it.each(['', 'short', 'has spaces in it ok', 'has:colon:in:the:code', 'x'.repeat(65)])(
      'refuses %j',
      (value) => expect(isSessionCode(value)).toBe(false),
    );
  });
});
