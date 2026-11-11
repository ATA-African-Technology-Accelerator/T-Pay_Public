import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisteredDevice } from '../support/apiFixture';
import { createApiFixture } from '../support/apiFixture';
import { createPaymentScenario } from '../support/paymentScenario';

describe('Active wallet API', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let scenario: Awaited<ReturnType<typeof createPaymentScenario>>;

  const wallet = async (device: RegisteredDevice = scenario.payee) =>
    (await scenario.get('/api/wallet', device)).body.data;
  const withdraw = (amountUsdMinor: number, key: string = randomUUID(), recipientEmail?: string) =>
    request(fixture.app)
      .post('/api/wallet/withdrawals')
      .set('Authorization', `Bearer ${scenario.payee.deviceToken}`)
      .set('Idempotency-Key', key)
      .send(recipientEmail === undefined ? { amountUsdMinor } : { amountUsdMinor, recipientEmail });
  const collect = async (sequence: number) => scenario.submit(await scenario.voucher(sequence));
  const history = async () =>
    (await fixture.transactions.listForDevice(scenario.payee.deviceId, null, 20)).items.map(({ type }) => type);
  const advance = (seconds: number) => {
    fixture.time.now = new Date(fixture.time.now.getTime() + seconds * 1000);
  };

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    scenario = await createPaymentScenario(fixture);
  });

  describe('GET /api/wallet', () => {
    it('requires a device token', async () => {
      expect((await request(fixture.app).get('/api/wallet')).status).toBe(401);
    });

    it('starts empty', async () => {
      expect(await wallet()).toEqual({
        balanceUsdMinor: 0,
        balanceNgnMinor: 0,
        pendingNgnMinor: 0,
        payoutEmail: 'merchant-sandbox@example.com',
        fxRate: '1500.00',
        entries: [],
      });
    });

    it('shows collected money with the contract shape', async () => {
      const { voucherId } = (await collect(1)).body.data;

      expect(await wallet()).toEqual({
        balanceUsdMinor: 133,
        balanceNgnMinor: 200_000,
        pendingNgnMinor: 0,
        payoutEmail: 'merchant-sandbox@example.com',
        fxRate: '1500.00',
        entries: [
          {
            entryId: expect.stringMatching(/^led_/),
            type: 'CREDIT',
            amountUsdMinor: 133,
            amountNgnMinor: 200_000,
            voucherId,
            paypalCaptureId: 'CAPTURE-1',
            createdAt: fixture.time.now.toISOString(),
          },
        ],
      });
    });

    it('adds up every settled voucher', async () => {
      await collect(1);
      await collect(2);

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 266, balanceNgnMinor: 400_000 });
    });

    it('shows money still settling as pending, not as balance', async () => {
      fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
      await collect(1);

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0, pendingNgnMinor: 200_000 });
    });

    it('never shows the payer the money they spent', async () => {
      await collect(1);

      expect(await wallet(scenario.payer)).toMatchObject({ balanceUsdMinor: 0, entries: [] });
    });

    it('takes a reversed payment out of the balance', async () => {
      const { voucherId } = (await collect(1)).body.data;
      await collect(2);

      await request(fixture.app).post('/api/webhooks/paypal').send({
        id: randomUUID(),
        event_type: 'PAYMENT.CAPTURE.REVERSED',
        resource: { id: 'CAPTURE-1', invoice_id: voucherId },
      });

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 133, balanceNgnMinor: 200_000 });
    });
  });

  describe('POST /api/wallet/withdrawals', () => {
    it('pays out to the account PayPal email', async () => {
      await collect(1);

      const response = await withdraw(133);

      expect(response.status).toBe(202);
      expect(response.body.data).toEqual({
        withdrawalId: expect.stringMatching(/^wdr_/),
        status: 'PENDING',
        paypalBatchId: 'BATCH-1',
      });
      expect(fixture.gateway.payouts).toEqual([
        {
          senderBatchId: response.body.data.withdrawalId,
          receiverEmail: 'merchant-sandbox@example.com',
          amountUsdMinor: 133,
        },
      ]);
    });

    it('pays out to any email the person names, such as someone who is not on T-Pay', async () => {
      await collect(1);

      const response = await withdraw(100, randomUUID(), '  Chidi@Example.com ');

      expect(response.status).toBe(202);
      expect(fixture.gateway.payouts[0]).toMatchObject({ receiverEmail: 'chidi@example.com', amountUsdMinor: 100 });
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 33 });
    });

    it.each(['not-an-email', '', 'a@b', 'x'.repeat(250) + '@example.com'])('refuses the recipient %j', async (email) => {
      await collect(1);

      expect((await withdraw(100, randomUUID(), email)).status).toBe(400);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 133 });
    });

    it('does not accept the same key for a different recipient', async () => {
      await collect(1);
      const key = randomUUID();

      await withdraw(50, key, 'a@example.com');
      const second = await withdraw(50, key, 'b@example.com');

      expect(second.status).toBe(409);
      expect(fixture.gateway.payouts).toHaveLength(1);
    });

    it('takes the money out of the balance at once', async () => {
      await collect(1);

      await withdraw(133);

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0, balanceNgnMinor: 0 });
      expect((await wallet()).entries[0]).toMatchObject({ type: 'WITHDRAWAL', amountUsdMinor: 133 });
      expect((await history())[0]).toBe('WITHDRAWAL_REQUESTED');
    });

    it('leaves the rest after a partial withdrawal', async () => {
      await collect(1);

      await withdraw(33);

      expect(await wallet()).toMatchObject({ balanceUsdMinor: 100, balanceNgnMinor: 150_500 });
    });

    it('never pays more than the balance', async () => {
      await collect(1);

      const response = await withdraw(134);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INSUFFICIENT_BALANCE');
      expect(fixture.gateway.payouts).toHaveLength(0);
    });

    it.each([0, -1, 1.5])('rejects an amount of %s', async (amount) => {
      await collect(1);

      expect((await withdraw(amount)).status).toBe(400);
    });

    it('requires an idempotency key', async () => {
      const response = await request(fixture.app)
        .post('/api/wallet/withdrawals')
        .set('Authorization', `Bearer ${scenario.payee.deviceToken}`)
        .send({ amountUsdMinor: 1 });

      expect(response.status).toBe(400);
    });

    it('produces one payout when a request is repeated', async () => {
      await collect(1);
      const key = randomUUID();

      const first = await withdraw(133, key);
      const second = await withdraw(133, key);

      expect(second.body).toEqual(first.body);
      expect(fixture.gateway.payouts).toHaveLength(1);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
    });

    it('never overdraws when two withdrawals race', async () => {
      await collect(1);

      const responses = await Promise.all([withdraw(100), withdraw(100), withdraw(100)]);

      expect(responses.filter(({ status }) => status === 202)).toHaveLength(1);
      expect(fixture.gateway.payouts).toHaveLength(1);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 33 });
    });

    it('refuses to pay out money that was reversed', async () => {
      const { voucherId } = (await collect(1)).body.data;
      await request(fixture.app).post('/api/webhooks/paypal').send({
        id: randomUUID(),
        event_type: 'PAYMENT.CAPTURE.REVERSED',
        resource: { id: 'CAPTURE-1', invoice_id: voucherId },
      });

      expect((await withdraw(133)).status).toBe(422);
    });

    describe('when PayPal refuses', () => {
      it('reports failure and returns the money', async () => {
        await collect(1);
        fixture.gateway.plannedPayouts.push({ outcome: 'REJECTED', reason: 'INSUFFICIENT_FUNDS' });

        const response = await withdraw(133);

        expect(response.status).toBe(202);
        expect(response.body.data).toMatchObject({ status: 'FAILED', paypalBatchId: null });
        expect(await wallet()).toMatchObject({ balanceUsdMinor: 133, balanceNgnMinor: 200_000 });
        expect((await wallet()).entries[0]).toMatchObject({ type: 'WITHDRAWAL_RETURNED' });
        expect((await history())[0]).toBe('WITHDRAWAL_FAILED');
      });
    });

    describe('when PayPal does not answer', () => {
      beforeEach(async () => {
        await collect(1);
        fixture.gateway.plannedPayouts.push({ outcome: 'RETRY' });
      });

      it('keeps the withdrawal pending and the money reserved', async () => {
        const response = await withdraw(133);

        expect(response.status).toBe(202);
        expect(response.body.data).toMatchObject({ status: 'PENDING', paypalBatchId: null });
        expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
      });

      it('retries after the backoff with the same batch id', async () => {
        await withdraw(133);

        await fixture.jobs.runOnce();
        expect(fixture.gateway.payouts).toHaveLength(1);

        advance(37);
        await fixture.jobs.runOnce();

        const [first, second] = fixture.gateway.payouts;
        expect(second?.senderBatchId).toBe(first?.senderBatchId);
      });

      it('finishes the payout once PayPal accepts it', async () => {
        const { withdrawalId } = (await withdraw(133)).body.data;
        advance(37);

        await fixture.jobs.runOnce();

        expect(await fixture.wallet.findWithdrawal(withdrawalId)).toMatchObject({ paypalBatchId: 'BATCH-2' });
      });
    });

    describe('after PayPal accepts it', () => {
      const pendingWithdrawal = async () => {
        await collect(1);
        return (await withdraw(133)).body.data.withdrawalId as string;
      };

      it('stays pending while PayPal is processing', async () => {
        const withdrawalId = await pendingWithdrawal();
        advance(37);

        await fixture.jobs.runOnce();

        expect((await fixture.wallet.findWithdrawal(withdrawalId))?.status).toBe('PENDING');
      });

      it('completes and records it in history', async () => {
        const withdrawalId = await pendingWithdrawal();
        fixture.gateway.payoutStatus = 'COMPLETED';
        advance(37);

        await fixture.jobs.runOnce();

        expect((await fixture.wallet.findWithdrawal(withdrawalId))?.status).toBe('COMPLETED');
        expect((await history())[0]).toBe('WITHDRAWAL_COMPLETED');
        expect(await wallet()).toMatchObject({ balanceUsdMinor: 0 });
      });

      it('returns the money when the payout fails later', async () => {
        const withdrawalId = await pendingWithdrawal();
        fixture.gateway.payoutStatus = 'FAILED';
        advance(37);

        await fixture.jobs.runOnce();
        advance(3600);
        await fixture.jobs.runOnce();

        expect((await fixture.wallet.findWithdrawal(withdrawalId))?.status).toBe('FAILED');
        expect(await wallet()).toMatchObject({ balanceUsdMinor: 133 });
      });

      it('checks again later when PayPal is down', async () => {
        const withdrawalId = await pendingWithdrawal();
        fixture.gateway.unavailable = true;
        advance(37);
        await fixture.jobs.runOnce();

        fixture.gateway.unavailable = false;
        fixture.gateway.payoutStatus = 'COMPLETED';
        advance(3600);
        await fixture.jobs.runOnce();

        expect((await fixture.wallet.findWithdrawal(withdrawalId))?.status).toBe('COMPLETED');
      });
    });
  });
});
