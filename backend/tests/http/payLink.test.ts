import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisteredDevice } from '../support/apiFixture';
import { createApiFixture } from '../support/apiFixture';

describe('Pay link', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let owner: RegisteredDevice;

  const link = async (who: RegisteredDevice = owner) =>
    (await request(fixture.app).get('/api/wallet/pay-link').set('Authorization', `Bearer ${who.deviceToken}`)).body.data.url as string;
  const pathOf = (url: string) => new URL(url).pathname;
  const wallet = async (who: RegisteredDevice = owner) =>
    (await request(fixture.app).get('/api/wallet').set('Authorization', `Bearer ${who.deviceToken}`)).body.data;
  const submit = (url: string, amount: string) => request(fixture.app).post(pathOf(url)).type('form').send({ amount });
  const comeBack = (url: string, depositId: string, outcome: 'approved' | 'cancelled', token = `DEP-ORDER-${fixture.gateway.captureOrders.length}`) =>
    request(fixture.app).get(`${pathOf(url)}/return`).query({ depositId, outcome, token });
  const checkout = async (url: string, amount = '10.00') => {
    const response = await submit(url, amount);
    const depositId = fixture.gateway.captureOrders.at(-1)?.depositId as string;
    return { response, depositId };
  };

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    owner = await fixture.registerDevice('Mama Nkechi');
  });

  describe('GET /api/wallet/pay-link', () => {
    it('gives a link on this server, and the same link every time', async () => {
      const first = await link();

      expect(first).toMatch(/^https:\/\/tpay\.test\/pay\/[A-Za-z0-9_-]{22}$/);
      expect(await link()).toBe(first);
    });

    it('gives each account its own link', async () => {
      const other = await fixture.registerDevice('Bola');

      expect(await link(other)).not.toBe(await link());
    });

    it('needs a device token', async () => {
      expect((await request(fixture.app).get('/api/wallet/pay-link')).status).toBe(401);
    });
  });

  describe('the public page', () => {
    it('shows who will be paid and asks for an amount, and never shows the owner’s email', async () => {
      const response = await request(fixture.app).get(pathOf(await link()));

      expect(response.status).toBe(200);
      expect(response.text).toContain('Pay Mama Nkechi');
      expect(response.text).toContain('name="amount"');
      expect(response.text).not.toContain('merchant-sandbox@example.com');
    });

    it('escapes the owner’s name, so a name like a script tag can do nothing', async () => {
      const sneaky = await fixture.registerDevice('<script>alert("x")</script>');

      const response = await request(fixture.app).get(pathOf(await link(sneaky)));

      expect(response.text).not.toContain('<script>');
      expect(response.text).toContain('&#60;script&#62;');
    });

    it('sends security headers that stop it loading anything or being framed', async () => {
      const response = await request(fixture.app).get(pathOf(await link()));

      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('answers a link that does not exist with not found, and makes no PayPal order', async () => {
      const missing = '/pay/AAAAAAAAAAAAAAAAAAAAAA';

      expect((await request(fixture.app).get(missing)).status).toBe(404);
      expect((await request(fixture.app).post(missing).type('form').send({ amount: '5' })).status).toBe(404);
      expect(fixture.gateway.captureOrders).toHaveLength(0);
    });
  });

  describe('paying', () => {
    it('sends the payer to PayPal for the amount they typed', async () => {
      const { response } = await checkout(await link(), '12.50');

      expect(response.status).toBe(303);
      expect(response.headers.location).toContain('paypal.com');
      expect(fixture.gateway.captureOrders[0]).toMatchObject({ amountUsdMinor: 1250 });
      expect(fixture.gateway.captureOrders[0]?.returnUrl).toContain('/pay/');
    });

    it.each(['', 'abc', '0.99', '-5', '10.999', '501', '5000000', '1e3', ' '])('refuses the amount %j', async (amount) => {
      const response = await submit(await link(), amount);

      expect(response.status).toBe(400);
      expect(fixture.gateway.captureOrders).toHaveLength(0);
    });

    it('credits nothing until PayPal has captured the payment', async () => {
      await checkout(await link());

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('credits the owner once when the payer returns approved, and shows a thank you', async () => {
      const url = await link();
      const { depositId } = await checkout(url, '10.00');
      fixture.gateway.approve('DEP-ORDER-1');

      const back = await comeBack(url, depositId, 'approved');

      expect(back.status).toBe(200);
      expect(back.text).toContain('Payment sent');
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 1000, balanceNgnMinor: 1_500_000 });
      expect((await wallet()).entries[0]).toMatchObject({ type: 'PAYMENT_LINK', paypalCaptureId: 'DEP-CAPTURE-1' });
      expect((await fixture.transactions.listForDevice(owner.deviceId, null, 10)).items.map(({ type }) => type)).toEqual(['PAYMENT_LINK_RECEIVED']);
    });

    it('credits once however often the payer reloads the return page, even all at once', async () => {
      const url = await link();
      const { depositId } = await checkout(url);
      fixture.gateway.approve('DEP-ORDER-1');

      await Promise.all([comeBack(url, depositId, 'approved'), comeBack(url, depositId, 'approved'), comeBack(url, depositId, 'approved')]);
      await comeBack(url, depositId, 'approved');

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 1000 });
      expect((await wallet()).entries.filter(({ type }: { type: string }) => type === 'PAYMENT_LINK')).toHaveLength(1);
    });

    it('credits nothing when the payer comes back without approving', async () => {
      const url = await link();
      const { depositId } = await checkout(url);

      const back = await comeBack(url, depositId, 'approved');

      expect(back.text).toContain('Nothing was paid');
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('credits nothing when the payer cancels, and the deposit can no longer be completed', async () => {
      const url = await link();
      const { depositId } = await checkout(url);

      await comeBack(url, depositId, 'cancelled');
      fixture.gateway.approve('DEP-ORDER-1');
      await comeBack(url, depositId, 'approved');

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('ignores a return that does not carry PayPal’s order token', async () => {
      const url = await link();
      const { depositId } = await checkout(url);
      fixture.gateway.approve('DEP-ORDER-1');

      const guessed = await comeBack(url, depositId, 'approved', 'WRONG');

      expect(guessed.status).toBe(404);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('never credits the wrong account, even through another account’s link', async () => {
      const other = await fixture.registerDevice('Bola');
      const { depositId } = await checkout(await link(other));
      fixture.gateway.approve('DEP-ORDER-1');

      await comeBack(await link(), depositId, 'approved');

      expect(await wallet(other)).toMatchObject({ balanceUsdMinor: 1000 });
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('does not let the app complete or cancel a link payment', async () => {
      const { depositId } = await checkout(await link());
      fixture.gateway.approve('DEP-ORDER-1');

      const attempt = await request(fixture.app)
        .post(`/api/wallet/deposits/${depositId}/complete`)
        .set('Authorization', `Bearer ${owner.deviceToken}`).set('Idempotency-Key', 'k1').send({});

      expect(attempt.status).toBe(404);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('says so when PayPal is unreachable, and keeps nothing half-made', async () => {
      const url = await link();
      fixture.gateway.unavailable = true;

      const response = await submit(url, '10');

      expect(response.status).toBe(503);
      expect(response.text).toContain('try again');
    });

    it('lets the owner withdraw what was paid, to any email', async () => {
      const url = await link();
      const { depositId } = await checkout(url, '10.00');
      fixture.gateway.approve('DEP-ORDER-1');
      await comeBack(url, depositId, 'approved');

      const out = await request(fixture.app)
        .post('/api/wallet/withdrawals').set('Authorization', `Bearer ${owner.deviceToken}`).set('Idempotency-Key', 'k2')
        .send({ amountUsdMinor: 1000, recipientEmail: 'chidi@example.com' });

      expect(out.status).toBe(202);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });
  });

  describe('limits', () => {
    it('stops one address from making PayPal orders over and over', async () => {
      const url = await link();
      const results: number[] = [];
      for (let i = 0; i < 14; i += 1) results.push((await submit(url, '5')).status);

      expect(results.filter((status) => status === 303)).toHaveLength(10);
      expect(results.filter((status) => status === 429).length).toBe(4);
      expect(fixture.gateway.captureOrders).toHaveLength(10);
    });

    it('does not limit opening the page', async () => {
      const url = await link();
      for (let i = 0; i < 25; i += 1) expect((await request(fixture.app).get(pathOf(url))).status).toBe(200);
    });
  });
});
