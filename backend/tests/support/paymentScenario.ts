import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type {
  ReceiptPayload, SignedEnvelope, SpendStatementPayload, VoucherPayload,
} from '@tpay/shared/contracts/messages';
import { canonicalJson } from '@tpay/shared/domain/canonicalJson';
import { signMessage } from '@tpay/shared/domain/signedMessages';
import type { RegisteredDevice, createApiFixture } from './apiFixture';

type Fixture = Awaited<ReturnType<typeof createApiFixture>>;
export const HOUR_MS = 60 * 60 * 1000;

/** `fromWallet` funds the customer's Online wallet with N15,000 first and locks from it, with no PayPal hold. */
export async function createPaymentScenario(fixture: Fixture, { fromWallet = false }: { fromWallet?: boolean } = {}) {
  const payer = await fixture.registerDevice('Customer');
  const payee = await fixture.registerDevice('Mama Nkechi');

  const post = (path: string, device: RegisteredDevice, body: object = {}) =>
    request(fixture.app)
      .post(path)
      .set('Authorization', `Bearer ${device.deviceToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  const get = (path: string, device: RegisteredDevice) =>
    request(fixture.app).get(path).set('Authorization', `Bearer ${device.deviceToken}`);

  let locked: request.Response;
  if (fromWallet) {
    const deposit = await post('/api/wallet/deposits', payer, { amountNgnMinor: 1_500_000 });
    fixture.gateway.approve(`DEP-ORDER-${fixture.gateway.captureOrders.length}`);
    await post(`/api/wallet/deposits/${deposit.body.data.depositId}/complete`, payer);
    locked = await post('/api/vaults/from-wallet', payer, { amountNgnMinor: 1_000_000, durationHours: 24 });
  } else {
    const created = await post('/api/vaults', payer, { amountNgnMinor: 1_000_000, durationHours: 24 });
    fixture.gateway.approve(`ORDER-${fixture.gateway.orders.length}`);
    locked = await post(`/api/vaults/${created.body.data.vaultId}/authorize`, payer);
  }
  const { vault, vaultCertificate } = locked.body.data;
  const vaultId: string = vault.vaultId;

  const voucher = (sequence: number, overrides: Partial<VoucherPayload> = {}, privateKey = payer.privateKey) =>
    signMessage<VoucherPayload>(
      MESSAGE_PREFIX.VOUCHER,
      {
        vaultId,
        keyId: payer.keyId,
        deviceId: payer.deviceId,
        sequence,
        amountNgnMinor: 200_000,
        amountUsdMinor: 133,
        fxRate: '1500.00',
        payeeKeyId: payee.keyId,
        requestNonce: `nonce_${sequence}`,
        issuedAt: fixture.time.now.toISOString(),
        expiresAt: vault.spendBy,
        ...overrides,
      },
      privateKey,
      fixture.signer,
    );

  const submit = (signed: SignedEnvelope<VoucherPayload>, device = payee, extra: object = {}) =>
    post('/api/vouchers', device, { voucher: signed, vaultCertificate, ...extra });

  const receipt = async (signed: SignedEnvelope<VoucherPayload>, overrides: Partial<ReceiptPayload> = {}) =>
    signMessage<ReceiptPayload>(
      MESSAGE_PREFIX.RECEIPT,
      {
        vaultId,
        sequence: signed.payload.sequence,
        voucherHash: await fixture.signer.hash(canonicalJson(signed)),
        merchantKeyId: payee.keyId,
        receivedAt: fixture.time.now.toISOString(),
        ...overrides,
      },
      payee.privateKey,
      fixture.signer,
    );

  const statement = (lastSequence: number, totalIssuedUsdMinor: number, privateKey = payer.privateKey) =>
    signMessage<SpendStatementPayload>(
      MESSAGE_PREFIX.SPEND_STATEMENT,
      { vaultId, lastSequence, totalIssuedUsdMinor, issuedAt: fixture.time.now.toISOString() },
      privateKey,
      fixture.signer,
    );

  const melt = async (lastSequence: number, total: number, device = payer) =>
    post(`/api/vaults/${vaultId}/melt`, device, { spendStatement: await statement(lastSequence, total) });

  return {
    payer, payee, vaultId, vault, vaultCertificate, post, get, voucher, submit, receipt, statement, melt,
  };
}
