import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiFixture } from '../support/apiFixture';
import { createPaymentScenario } from '../support/paymentScenario';

describe('POST /api/webhooks/paypal', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let scenario: Awaited<ReturnType<typeof createPaymentScenario>>;

  const send = (event: object) =>
    request(fixture.app).post('/api/webhooks/paypal').send(event);
  const event = (eventType: string, resource: object, id: string = randomUUID()) => ({
    id,
    event_type: eventType,
    resource,
  });
  const pendingVoucher = async () => {
    fixture.gateway.plannedCaptures.push({ outcome: 'PENDING', captureId: 'CAPTURE-P' });
    const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;
    return voucherId as string;
  };
  const settledVoucher = async () => (await scenario.submit(await scenario.voucher(1))).body.data.voucherId as string;
  const status = async (voucherId: string) => (await fixture.vouchers.findById(voucherId))?.status;
  const ledger = () => fixture.vouchers.listLedgerForDevice(scenario.payee.deviceId);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fixture = await createApiFixture();
    scenario = await createPaymentScenario(fixture);
  });

  it('needs no device token, and passes PayPal the original bytes', async () => {
    const response = await request(fixture.app)
      .post('/api/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('PayPal-Transmission-Id', 'tx-1')
      .send('{"id":"WH-1",  "event_type":"OTHER","resource":{}}');

    expect(response.status).toBe(200);
    expect(fixture.gateway.webhooks[0]).toMatchObject({
      rawBody: '{"id":"WH-1",  "event_type":"OTHER","resource":{}}',
      headers: { 'paypal-transmission-id': 'tx-1' },
    });
  });

  it('refuses a bad signature and changes nothing', async () => {
    const voucherId = await pendingVoucher();
    fixture.gateway.webhookIsValid = false;

    const response = await send(event('PAYMENT.CAPTURE.COMPLETED', { id: 'CAPTURE-P', invoice_id: voucherId }));

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_SIGNATURE');
    expect(await status(voucherId)).toBe('SETTLING');
  });

  it('settles a pending capture when it completes', async () => {
    const voucherId = await pendingVoucher();

    await send(event('PAYMENT.CAPTURE.COMPLETED', { id: 'CAPTURE-P', invoice_id: voucherId }));

    expect(await status(voucherId)).toBe('SETTLED');
    expect(await ledger()).toMatchObject([{ type: 'CREDIT', amountUsdMinor: 133, paypalCaptureId: 'CAPTURE-P' }]);
  });

  it('applies a replayed event only once', async () => {
    const voucherId = await pendingVoucher();
    const completed = event('PAYMENT.CAPTURE.COMPLETED', { id: 'CAPTURE-P', invoice_id: voucherId });

    await send(completed);
    const replay = await send(completed);

    expect(replay.status).toBe(200);
    expect(await ledger()).toHaveLength(1);
  });

  it('credits once when a new event repeats a settled capture', async () => {
    const voucherId = await settledVoucher();

    await send(event('PAYMENT.CAPTURE.COMPLETED', { id: 'CAPTURE-1', invoice_id: voucherId }));

    expect(await ledger()).toHaveLength(1);
  });

  it('keeps a voucher settling on a pending event', async () => {
    fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
    const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

    await send(event('PAYMENT.CAPTURE.PENDING', { id: 'CAPTURE-P', invoice_id: voucherId }));

    expect(await fixture.vouchers.findById(voucherId)).toMatchObject({
      status: 'SETTLING',
      paypalCaptureId: 'CAPTURE-P',
    });
  });

  it.each(['PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.DENIED'])('blocks the voucher on %s', async (type) => {
    const voucherId = await pendingVoucher();

    await send(event(type, { id: 'CAPTURE-P', invoice_id: voucherId }));

    expect(await status(voucherId)).toBe('SETTLEMENT_BLOCKED');
    expect(await ledger()).toEqual([]);
  });

  it.each(['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'])(
    'takes the money back from the payee on %s',
    async (type) => {
      const voucherId = await settledVoucher();

      await send(event(type, { id: 'CAPTURE-1', invoice_id: voucherId }));

      expect(await status(voucherId)).toBe('SETTLEMENT_BLOCKED');
      expect((await ledger()).map((entry) => entry.type)).toEqual(['REVERSAL', 'CREDIT']);
      expect(await fixture.vouchers.listAlerts(scenario.vaultId)).toMatchObject([{ type: 'PAYMENT_REVERSED' }]);
    },
  );

  it('finds a refund through its capture link when it carries no invoice', async () => {
    const voucherId = await settledVoucher();
    const links = [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE-1' }];

    await send(event('PAYMENT.CAPTURE.REFUNDED', { id: 'REFUND-1', links }));

    expect(await status(voucherId)).toBe('SETTLEMENT_BLOCKED');
  });

  it('closes the vault and blocks unfinished vouchers when the authorization is voided', async () => {
    fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
    const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

    await send(event('PAYMENT.AUTHORIZATION.VOIDED', { id: scenario.vault.paypalAuthorizationId }));

    expect(await status(voucherId)).toBe('SETTLEMENT_BLOCKED');
    expect((await fixture.vaults.findById(scenario.vaultId))?.status).toBe('CLOSED');
  });

  it('closes a pending vault when the approval is reversed', async () => {
    const created = await scenario.post('/api/vaults', await fixture.registerDevice('Third'), {
      amountNgnMinor: 500_000,
      durationHours: 2,
    });
    const orderId = `ORDER-${fixture.gateway.orders.length}`;

    await send(event('CHECKOUT.PAYMENT-APPROVAL.REVERSED', { order_id: orderId }));

    expect((await fixture.vaults.findById(created.body.data.vaultId))?.status).toBe('CLOSED');
  });

  it('accepts and ignores an event it does not handle', async () => {
    const response = await send(event('BILLING.PLAN.CREATED', {}));

    expect(response.status).toBe(200);
  });

  it('accepts an event for a voucher it does not know', async () => {
    const response = await send(event('PAYMENT.CAPTURE.COMPLETED', { id: 'CAPTURE-X', invoice_id: 'vch_unknown' }));

    expect(response.status).toBe(200);
  });
});
