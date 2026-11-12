import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisteredDevice } from '../support/apiFixture';
import { createApiFixture } from '../support/apiFixture';

describe('Add money API', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let device: RegisteredDevice;

  const post = (path: string, who: RegisteredDevice = device, body: object = {}, key: string = randomUUID()) =>
    request(fixture.app).post(path).set('Authorization', `Bearer ${who.deviceToken}`).set('Idempotency-Key', key).send(body);
  const deposit = (amountNgnMinor: number, who: RegisteredDevice = device) => post('/api/wallet/deposits', who, { amountNgnMinor });
  const complete = (id: string, who: RegisteredDevice = device, key?: string) => post(`/api/wallet/deposits/${id}/complete`, who, {}, key);
  const wallet = async (who: RegisteredDevice = device) =>
    (await request(fixture.app).get('/api/wallet').set('Authorization', `Bearer ${who.deviceToken}`)).body.data;
  const history = async (who: RegisteredDevice = device) =>
    (await fixture.transactions.listForDevice(who.deviceId, null, 20)).items.map(({ type }) => type);
  const approveLatest = () => fixture.gateway.approve(`DEP-ORDER-${fixture.gateway.captureOrders.length}`);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    device = await fixture.registerDevice('Ada');
  });

  describe('POST /api/wallet/deposits', () => {
    it('starts a PayPal checkout for the amount, at the fixed rate', async () => {
      const response = await deposit(1_500_000);

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual({
        depositId: expect.stringMatching(/^dep_/),
        amountNgnMinor: 1_500_000,
        amountUsdMinor: 1000,
        fxRate: '1500.00',
        approvalUrl: expect.stringContaining('paypal.com'),
      });
      expect(fixture.gateway.captureOrders[0]).toMatchObject({
        depositId: response.body.data.depositId,
        amountUsdMinor: 1000,
        returnUrl: `https://tpay.test/api/paypal/return?depositId=${response.body.data.depositId}&outcome=approved`,
        cancelUrl: `https://tpay.test/api/paypal/return?depositId=${response.body.data.depositId}&outcome=cancelled`,
      });
    });

    it('credits what the dollars are worth when the naira is not a whole number of cents', async () => {
      // ₦5,000 is $3.33 at 1,500 per dollar, and $3.33 is worth ₦4,995. PayPal takes the cents.
      const response = await deposit(500_000);

      expect(response.body.data).toMatchObject({ amountUsdMinor: 333, amountNgnMinor: 499_500 });
      approveLatest();
      await complete(response.body.data.depositId);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 333, balanceNgnMinor: 499_500 });
    });

    it('adds nothing until the payment is captured', async () => {
      await deposit(1_500_000);

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0, balanceNgnMinor: 0 });
    });

    it.each([0, -5, 1.5, 100_000, 1_000_000_001])('refuses an amount of %s kobo', async (amount) => {
      expect((await deposit(amount)).status).toBe(400);
      expect(fixture.gateway.captureOrders).toHaveLength(0);
    });

    it('requires a device token and an idempotency key', async () => {
      expect((await request(fixture.app).post('/api/wallet/deposits').send({ amountNgnMinor: 1_500_000 })).status).toBe(401);
      const noKey = await request(fixture.app)
        .post('/api/wallet/deposits').set('Authorization', `Bearer ${device.deviceToken}`).send({ amountNgnMinor: 1_500_000 });
      expect(noKey.status).toBe(400);
    });

    it('makes one checkout when the same request is repeated', async () => {
      const key = randomUUID();
      const first = await post('/api/wallet/deposits', device, { amountNgnMinor: 1_500_000 }, key);
      const second = await post('/api/wallet/deposits', device, { amountNgnMinor: 1_500_000 }, key);

      expect(second.body).toEqual(first.body);
      expect(fixture.gateway.captureOrders).toHaveLength(1);
    });

    it('reports PayPal being unreachable and keeps no half-made deposit', async () => {
      fixture.gateway.unavailable = true;

      expect((await deposit(1_500_000)).status).toBe(503);
      expect(await wallet()).toMatchObject({ balanceNgnMinor: 0 });
    });
  });

  describe('POST /api/wallet/deposits/{id}/complete', () => {
    it('captures the payment and credits the Online wallet', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;
      approveLatest();

      const response = await complete(depositId);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        depositId, status: 'COMPLETED', amountNgnMinor: 1_500_000, amountUsdMinor: 1000, paypalCaptureId: 'DEP-CAPTURE-1',
      });
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 1000, balanceNgnMinor: 1_500_000 });
      expect((await wallet()).entries[0]).toMatchObject({ type: 'DEPOSIT', paypalCaptureId: 'DEP-CAPTURE-1', voucherId: null });
      expect(await history()).toEqual(['DEPOSIT_COMPLETED']);
    });

    it('credits once however many times it is called, even at the same moment', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;
      approveLatest();

      const calls = await Promise.all([complete(depositId), complete(depositId), complete(depositId)]);
      await complete(depositId);

      expect(calls.every(({ status }) => status === 200)).toBe(true);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 1000 });
      expect((await wallet()).entries.filter(({ type }: { type: string }) => type === 'DEPOSIT')).toHaveLength(1);
      expect(await history()).toEqual(['DEPOSIT_COMPLETED']);
    });

    it('does not credit a payment the person never approved in PayPal', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;

      const response = await complete(depositId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ORDER_NOT_APPROVED');
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('can be completed after the person approves late', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;
      expect((await complete(depositId)).status).toBe(409);

      approveLatest();

      expect((await complete(depositId)).status).toBe(200);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 1000 });
    });

    it('answers 202 while PayPal is still confirming, and credits nothing yet', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;
      fixture.gateway.plannedOrderCaptures.push({ outcome: 'PENDING', captureId: 'DEP-CAPTURE-P' });

      const response = await complete(depositId);

      expect(response.status).toBe(202);
      expect(response.body.data).toMatchObject({ status: 'PENDING', paypalCaptureId: 'DEP-CAPTURE-P' });
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it.each([{ outcome: 'RETRY' }, { outcome: 'BLOCKED', reason: 'PAYER_ACTION_REQUIRED' }] as const)(
      'reports %j as PayPal unavailable and credits nothing', async (planned) => {
        const { depositId } = (await deposit(1_500_000)).body.data;
        fixture.gateway.plannedOrderCaptures.push(planned);

        expect((await complete(depositId)).status).toBe(503);
        expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
      },
    );

    it('never lets another device complete or read someone else’s deposit', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;
      approveLatest();
      const other = await fixture.registerDevice('Bola');

      const response = await complete(depositId, other);

      expect(response.status).toBe(404);
      expect(await wallet(other)).toMatchObject({ balanceUsdMinor: 0 });
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('answers an unknown deposit with not found', async () => {
      expect((await complete('dep_missing')).status).toBe(404);
    });

    it('lets the person withdraw what they added, to any email', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;
      approveLatest();
      await complete(depositId);

      const out = await post('/api/wallet/withdrawals', device, { amountUsdMinor: 400, recipientEmail: 'chidi@example.com' });

      expect(out.status).toBe(202);
      expect(fixture.gateway.payouts[0]).toMatchObject({ receiverEmail: 'chidi@example.com', amountUsdMinor: 400 });
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 600 });
    });

    it('refuses to withdraw more than was added', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;
      approveLatest();
      await complete(depositId);

      expect((await post('/api/wallet/withdrawals', device, { amountUsdMinor: 1001 })).status).toBe(422);
    });
  });

  describe('GET /api/paypal/return for a deposit', () => {
    it('sends an approved payer back into the app', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;

      const response = await request(fixture.app).get('/api/paypal/return').query({ depositId, outcome: 'approved' });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`tpay://wallet/return?depositId=${depositId}&outcome=approved`);
    });

    it('cancels the deposit when PayPal reports the payer cancelled, so it can never be completed', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;

      const response = await request(fixture.app).get('/api/paypal/return').query({ depositId, outcome: 'cancelled', token: 'DEP-ORDER-1' });
      approveLatest();

      expect(response.headers.location).toContain('outcome=cancelled');
      expect((await complete(depositId)).status).toBe(409);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('ignores a cancel that does not carry the right order, so nobody can cancel another person’s deposit', async () => {
      const { depositId } = (await deposit(1_500_000)).body.data;

      await request(fixture.app).get('/api/paypal/return').query({ depositId, outcome: 'cancelled', token: 'WRONG' });
      approveLatest();

      expect((await complete(depositId)).status).toBe(200);
    });

    it('still returns vault payers as before, and refuses a return naming both or neither', async () => {
      const vault = await request(fixture.app).get('/api/paypal/return').query({ vaultId: 'vlt_1', outcome: 'approved' });
      expect(vault.headers.location).toBe('tpay://vault/return?vaultId=vlt_1&outcome=approved');

      expect((await request(fixture.app).get('/api/paypal/return').query({ vaultId: 'a', depositId: 'b', outcome: 'approved' })).status).toBe(400);
      expect((await request(fixture.app).get('/api/paypal/return').query({ outcome: 'approved' })).status).toBe(400);
    });
  });
});
