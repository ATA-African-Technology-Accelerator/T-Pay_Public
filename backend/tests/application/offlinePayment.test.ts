import { beforeEach, describe, expect, it } from 'vitest';
import { acceptVoucher } from '@tpay/shared/application/use-cases/acceptVoucher';
import { issueVoucher } from '@tpay/shared/application/use-cases/issueVoucher';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import { REFUSAL } from '@tpay/shared/contracts/refusals';
import { verifyMessage, signMessage } from '@tpay/shared/domain/signedMessages';
import { capacity, clock, createOfflineFixture, signer } from '../support/offlineFixture';






type Fixture = Awaited<ReturnType<typeof createOfflineFixture>>;

describe('offline payment', () => {
  let fixture: Fixture;
  const deps = { signer, clock };

  beforeEach(async () => {
    fixture = await createOfflineFixture();
  });

  const issue = async (overrides: Partial<Parameters<typeof issueVoucher>[0]> = {}) =>
    issueVoucher(
      {
        request: await fixture.paymentRequest(),
        vaultCertificate: fixture.vaultCertificate,
        capacity: capacity(667),
        customerDeviceId: 'dev_customer',
        customerKeyId: 'key_customer',
        customerPrivateKey: fixture.customerKeys.privateKey,
        sequence: 1,
        rootPublicKey: fixture.root.publicKey,
        ...overrides,
      },
      deps,
    );

  const accept = async (
    voucher: Awaited<ReturnType<typeof issue>>,
    overrides: Partial<Parameters<typeof acceptVoucher>[0]> = {},
  ) =>
    acceptVoucher(
      {
        voucher: voucher.getValue().voucher,
        vaultCertificate: fixture.vaultCertificate,
        customerCertificate: fixture.customerCertificate,
        request: (await fixture.paymentRequest()).payload,
        merchantKeyId: 'key_merchant',
        merchantPrivateKey: fixture.merchantKeys.privateKey,
        alreadySeen: false,
        rootPublicKey: fixture.root.publicKey,
        ...overrides,
      },
      deps,
    );

  const reversedPayment = async () => {
    const { payload } = await fixture.paymentRequest();
    return {
      request: await signMessage(
        MESSAGE_PREFIX.PAYMENT_REQUEST,
        {
          ...payload,
          merchantKeyId: 'key_customer',
          merchantCertificate: fixture.customerCertificate,
        },
        fixture.customerKeys.privateKey,
        signer,
      ),
      vaultCertificate: await signMessage(
        MESSAGE_PREFIX.VAULT_CERTIFICATE,
        { ...fixture.vaultPayload, keyId: 'key_merchant' },
        fixture.root.privateKey,
        signer,
      ),
    };
  };



  describe('issueVoucher', () => {
    it('creates a signed voucher and reserves capacity', async () => {
      const result = await issue();
      const { voucher, capacity: updated } = result.getValue();

      expect(voucher.payload).toMatchObject({
        vaultId: 'vlt_1',
        sequence: 1,
        amountNgnMinor: 200_000,
        amountUsdMinor: 133,
        fxRate: '1500.00',
        payeeKeyId: 'key_merchant',
        requestNonce: 'nonce_1',
      });
      expect(updated.remaining.minor).toBe(534);
      expect(
        await verifyMessage(MESSAGE_PREFIX.VOUCHER, voucher, fixture.customerKeys.publicKey, signer),
      ).toBe(true);
    });

    it('refuses before signing when capacity is too low', async () => {
      expect((await issue({ capacity: capacity(100) })).error).toBe(
        REFUSAL.INSUFFICIENT_VAULT_CAPACITY,
      );
    });

    it('lets the same account collect and pay', async () => {
      const { request, vaultCertificate } = await reversedPayment();

      const voucher = await issue({
        request,
        vaultCertificate,
        customerDeviceId: 'dev_merchant',
        customerKeyId: 'key_merchant',
        customerPrivateKey: fixture.merchantKeys.privateKey,
      });

      expect(voucher.isSuccess).toBe(true);
    });

    it('refuses a payment to the same account', async () => {
      const { vaultCertificate } = await reversedPayment();

      const voucher = await issue({
        vaultCertificate,
        customerDeviceId: 'dev_merchant',
        customerKeyId: 'key_merchant',
        customerPrivateKey: fixture.merchantKeys.privateKey,
      });

      expect(voucher.error).toBe(REFUSAL.SELF_PAYMENT);
    });

    it('refuses a merchant certificate from an unknown issuer', async () => {
      const attacker = await signer.generateKeyPair();
      const fake = await fixture.certificate(fixture.merchantCertificate.payload, attacker.privateKey);
      const request = await fixture.paymentRequest({ merchantCertificate: fake });

      expect((await issue({ request })).error).toBe(REFUSAL.INVALID_CERTIFICATE);
    });

    it('refuses a changed payment request', async () => {
      const request = await fixture.paymentRequest();
      const forged = { ...request, payload: { ...request.payload, amountNgnMinor: 1 } };

      expect((await issue({ request: forged })).error).toBe(REFUSAL.INVALID_SIGNATURE);
    });

    it('refuses an expired payment request', async () => {
      const request = await fixture.paymentRequest({ expiresAt: '2026-11-06T09:00:00.000Z' });

      expect((await issue({ request })).error).toBe(REFUSAL.REQUEST_EXPIRED);
    });

    it('refuses to spend after the vault spend-by time', async () => {
      const expired = await signMessage(
        MESSAGE_PREFIX.VAULT_CERTIFICATE,
        { ...fixture.vaultPayload, spendBy: '2026-11-06T09:00:00.000Z' },
        fixture.root.privateKey,
        signer,
      );

      expect((await issue({ vaultCertificate: expired })).error).toBe(REFUSAL.VAULT_EXPIRED);
    });
  });

  describe('acceptVoucher', () => {
    it('refuses a voucher whose dollar amount does not match the rate', async () => {
      const issued = await issue();
      const { voucher } = issued.getValue();
      const cheap = await signMessage(
        MESSAGE_PREFIX.VOUCHER,
        { ...voucher.payload, amountUsdMinor: 1 },
        fixture.customerKeys.privateKey,
        signer,
      );

      const result = await accept(issued, { voucher: cheap });

      expect(result.error).toBe(REFUSAL.REQUEST_MISMATCH);
    });

    it('accepts a valid voucher and returns a signed receipt', async () => {
      const voucher = await issue();
      const receipt = (await accept(voucher)).getValue();

      expect(receipt.payload).toMatchObject({
        vaultId: 'vlt_1',
        sequence: 1,
        merchantKeyId: 'key_merchant',
      });
      expect(
        await verifyMessage(MESSAGE_PREFIX.RECEIPT, receipt, fixture.merchantKeys.publicKey, signer),
      ).toBe(true);
    });

    it('rejects a voucher with a changed amount', async () => {
      const voucher = await issue();
      const original = voucher.getValue().voucher;
      const forged = { ...original, payload: { ...original.payload, amountNgnMinor: 5_000_000 } };

      expect((await accept(voucher, { voucher: forged })).error).toBe(REFUSAL.INVALID_SIGNATURE);
    });

    it('rejects a customer certificate from an unknown issuer', async () => {
      const voucher = await issue();
      const attacker = await signer.generateKeyPair();
      const fake = await fixture.certificate(fixture.customerCertificate.payload, attacker.privateKey);

      expect((await accept(voucher, { customerCertificate: fake })).error).toBe(
        REFUSAL.INVALID_CERTIFICATE,
      );
    });

    it('rejects a vault certificate that belongs to another device', async () => {
      const voucher = await issue();
      const other = await signMessage(
        MESSAGE_PREFIX.VAULT_CERTIFICATE,
        { ...fixture.vaultPayload, keyId: 'key_someone_else' },
        fixture.root.privateKey,
        signer,
      );

      expect((await accept(voucher, { vaultCertificate: other })).error).toBe(
        REFUSAL.INVALID_CERTIFICATE,
      );
    });


    it('rejects a voucher paying its own signer', async () => {
      const issued = await issue();
      const voucher = await signMessage(
        MESSAGE_PREFIX.VOUCHER,
        { ...issued.getValue().voucher.payload, payeeKeyId: 'key_customer' },
        fixture.customerKeys.privateKey,
        signer,
      );

      expect((await accept(issued, { voucher, merchantKeyId: 'key_customer' })).error).toBe(
        REFUSAL.SELF_PAYMENT,
      );
    });

    it('rejects a voucher for another merchant', async () => {
      const voucher = await issue();

      expect((await accept(voucher, { merchantKeyId: 'key_other' })).error).toBe(
        REFUSAL.WRONG_PAYEE,
      );
    });

    it('rejects a voucher made for a different request', async () => {
      const voucher = await issue();
      const request = (await fixture.paymentRequest({ nonce: 'nonce_2' })).payload;

      expect((await accept(voucher, { request })).error).toBe(REFUSAL.REQUEST_MISMATCH);
    });

    it('rejects a duplicate voucher', async () => {
      const voucher = await issue();

      expect((await accept(voucher, { alreadySeen: true })).error).toBe(REFUSAL.DUPLICATE_VOUCHER);
    });
  });
});