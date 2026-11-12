// Locking money from the Online wallet: no PayPal step, the wallet is debited once, the merchant is
// paid from it, and whatever is not spent comes back once. Every way it could lose or make money.
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisteredDevice } from '../support/apiFixture';
import { createApiFixture } from '../support/apiFixture';
import { createPaymentScenario, HOUR_MS } from '../support/paymentScenario';

const LOCK = { amountNgnMinor: 1_000_000, durationHours: 24 }; // N10,000 is $6.67

describe('Lock from the Online wallet', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let device: RegisteredDevice;

  const post = (path: string, body: object, key: string = randomUUID(), who: RegisteredDevice = device) =>
    request(fixture.app).post(path).set('Authorization', `Bearer ${who.deviceToken}`).set('Idempotency-Key', key).send(body);
  const wallet = async (who: RegisteredDevice = device) =>
    (await request(fixture.app).get('/api/wallet').set('Authorization', `Bearer ${who.deviceToken}`)).body.data;
  const fund = async (amountNgnMinor: number, who: RegisteredDevice = device) => {
    const deposit = await post('/api/wallet/deposits', { amountNgnMinor }, randomUUID(), who);
    fixture.gateway.approve(`DEP-ORDER-${fixture.gateway.captureOrders.length}`);
    await post(`/api/wallet/deposits/${deposit.body.data.depositId}/complete`, {}, randomUUID(), who);
  };
  const lock = (body: object = LOCK, key?: string, who?: RegisteredDevice) => post('/api/vaults/from-wallet', body, key, who);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    device = await fixture.registerDevice('Ada');
  });

  describe('locking', () => {
    it('opens a ready vault at once, with no PayPal step, and takes the money out of the wallet', async () => {
      await fund(1_500_000);
      const ordersBefore = fixture.gateway.orders.length;

      const response = await lock();

      expect(response.status).toBe(201);
      expect(response.body.data.vault).toMatchObject({ status: 'ACTIVE', authorisedUsdMinor: 667, remainingUsdMinor: 667, fundedBy: 'WALLET' });
      expect(response.body.data.vaultCertificate.payload).toMatchObject({ authorisedUsdMinor: 667, amountNgnMinor: 1_000_000 });
      expect(fixture.gateway.orders.length).toBe(ordersBefore);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 1000 - 667, balanceNgnMinor: 1_500_000 - 1_000_000 });
    });

    it('gives the same spend-by and settle-by as a PayPal vault', async () => {
      await fund(1_500_000);
      const { vault } = (await lock()).body.data;

      expect(vault.spendBy).toBe(new Date(fixture.time.now.getTime() + 24 * HOUR_MS).toISOString());
      expect(vault.settleBy).toBe(new Date(fixture.time.now.getTime() + 28 * 24 * HOUR_MS).toISOString());
    });

    it('records the lock in history', async () => {
      await fund(1_500_000);
      await lock();

      const { items } = await fixture.transactions.listForDevice(device.deviceId, null, 1);
      expect(items[0]).toMatchObject({ type: 'VAULT_LOCKED', amountNgnMinor: 1_000_000, amountUsdMinor: 667 });
    });

    it('refuses more than the wallet has, and changes nothing', async () => {
      await fund(500_000);

      const response = await lock();

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INSUFFICIENT_BALANCE');
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 333, balanceNgnMinor: 499_500 });
      expect(await fixture.vaults.findOpenForDevice(device.deviceId)).toBeNull();
    });

    it('refuses an empty wallet', async () => {
      expect((await lock()).status).toBe(422);
    });

    it('can lock exactly everything in the wallet', async () => {
      await fund(1_500_000);
      const response = await lock({ amountNgnMinor: 1_500_000, durationHours: 1 });

      expect(response.status).toBe(201);
      expect(await wallet()).toMatchObject({ balanceUsdMinor: 0, balanceNgnMinor: 0 });
    });

    it.each([{ amountNgnMinor: 0, durationHours: 24 }, { amountNgnMinor: 1_000_000, durationHours: 0 }, { amountNgnMinor: 1_000_000, durationHours: 25 }, { amountNgnMinor: 1.5, durationHours: 24 }, { amountNgnMinor: 1, durationHours: 24 }, {}])(
      'refuses %j', async (body) => {
        await fund(1_500_000);
        const response = await lock(body);
        expect(response.status).toBe(400);
        expect((await wallet()).balanceUsdMinor).toBe(1000);
      },
    );

    it('refuses while a vault is already open, and takes nothing', async () => {
      await fund(3_000_000);
      await lock();

      const second = await lock();

      expect(second.status).toBe(409);
      expect((await wallet()).balanceUsdMinor).toBe(2000 - 667);
    });

    it('replaces a PayPal lock that was started but never approved', async () => {
      await fund(1_500_000);
      await post('/api/vaults', LOCK);

      const response = await lock();

      expect(response.status).toBe(201);
      expect((await fixture.vaults.findOpenForDevice(device.deviceId))?.fundedBy).toBe('WALLET');
    });

    it('opens one vault and takes the money once when the same request is repeated', async () => {
      await fund(1_500_000);

      const first = await lock(LOCK, 'same-key');
      const again = await lock(LOCK, 'same-key');

      expect(again.body.data.vault.vaultId).toBe(first.body.data.vault.vaultId);
      expect((await wallet()).balanceUsdMinor).toBe(1000 - 667);
    });

    it('takes the money once when two locks race', async () => {
      await fund(3_000_000);

      const results = await Promise.all([lock(), lock(), lock()]);

      expect(results.filter(r => r.status === 201)).toHaveLength(1);
      expect((await wallet()).balanceUsdMinor).toBe(2000 - 667);
    });

    it('never lets a lock and a withdrawal spend the same money', async () => {
      await fund(1_500_000);

      const [locked, withdrawn] = await Promise.all([
        lock(),
        post('/api/wallet/withdrawals', { amountUsdMinor: 1000 }),
      ]);

      const succeeded = [locked.status === 201, withdrawn.status === 202].filter(Boolean);
      expect(succeeded).toHaveLength(1);
      expect((await wallet()).balanceUsdMinor).toBeGreaterThanOrEqual(0);
    });

    it('keeps locked money out of a withdrawal', async () => {
      await fund(1_500_000);
      await lock();

      const response = await post('/api/wallet/withdrawals', { amountUsdMinor: 1000 });

      expect(response.status).toBe(422);
    });

    it('needs a device token and an idempotency key', async () => {
      expect((await request(fixture.app).post('/api/vaults/from-wallet').send(LOCK)).status).toBe(401);
      expect((await request(fixture.app).post('/api/vaults/from-wallet').set('Authorization', `Bearer ${device.deviceToken}`).send(LOCK)).status).toBe(400);
    });
  });

  describe('spending and closing', () => {
    let scenario: Awaited<ReturnType<typeof createPaymentScenario>>;
    const afterSettleBy = () => new Date(fixture.time.now.getTime() + 28 * 24 * HOUR_MS + HOUR_MS);
    const payerWallet = () => wallet(scenario.payer);
    const payeeWallet = () => wallet(scenario.payee);

    beforeEach(async () => {
      scenario = await createPaymentScenario(fixture, { fromWallet: true });
    });

    it('starts with N5,000 left in the customer wallet', async () => {
      expect(await payerWallet()).toMatchObject({ balanceUsdMinor: 333, balanceNgnMinor: 500_000 });
    });

    it('pays the merchant from the vault with no PayPal capture', async () => {
      const response = await scenario.submit(await scenario.voucher(1));

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('SETTLED');
      expect(fixture.gateway.captureCalls).toHaveLength(0);
      expect(await payeeWallet()).toMatchObject({ balanceUsdMinor: 133, balanceNgnMinor: 200_000 });
    });

    it('lets the merchant withdraw what they were paid', async () => {
      await scenario.submit(await scenario.voucher(1));

      const response = await scenario.post('/api/wallet/withdrawals', scenario.payee, { amountUsdMinor: 133 });

      expect(response.status).toBe(202);
    });

    it('returns the unspent money to the wallet when the customer melts, and never voids anything at PayPal', async () => {
      await scenario.submit(await scenario.voucher(1));

      const melted = await scenario.melt(1, 133);

      expect(melted.body.data.status).toBe('CLOSED');
      expect(fixture.gateway.voidedAuthorizations).toHaveLength(0);
      expect(await payerWallet()).toMatchObject({ balanceUsdMinor: 333 + (667 - 133), balanceNgnMinor: 500_000 + 800_000 });
    });

    it('returns everything when nothing was spent', async () => {
      await scenario.melt(0, 0);

      expect(await payerWallet()).toMatchObject({ balanceUsdMinor: 1000, balanceNgnMinor: 1_500_000 });
    });

    it('returns nothing when everything was spent', async () => {
      await scenario.submit(await scenario.voucher(1, { amountNgnMinor: 1_000_000, amountUsdMinor: 667 }));
      await scenario.melt(1, 667);

      expect(await payerWallet()).toMatchObject({ balanceUsdMinor: 333, balanceNgnMinor: 500_000 });
    });

    it('returns the money only once, however many times the vault is melted or released', async () => {
      await scenario.melt(0, 0);
      await scenario.melt(0, 0);
      fixture.time.now = afterSettleBy();
      await fixture.jobs.runOnce();

      expect((await payerWallet()).balanceUsdMinor).toBe(1000);
    });

    it('returns the unspent money at settle-by when the customer never melts', async () => {
      await scenario.submit(await scenario.voucher(1));
      fixture.time.now = afterSettleBy();

      await fixture.jobs.runOnce();

      expect((await fixture.vaults.findById(scenario.vaultId))?.status).toBe('CLOSED');
      expect((await payerWallet()).balanceUsdMinor).toBe(333 + 667 - 133);
    });

    it('waits for a voucher declared but not yet submitted before returning anything', async () => {
      const voucher = await scenario.voucher(1);

      const melted = await scenario.melt(1, 133);
      expect(melted.body.data.status).toBe('SPEND_CLOSED');
      expect((await payerWallet()).balanceUsdMinor).toBe(333);

      await scenario.submit(voucher);
      expect((await fixture.vaults.findById(scenario.vaultId))?.status).toBe('CLOSED');
      expect((await payerWallet()).balanceUsdMinor).toBe(333 + 667 - 133);
      expect((await payeeWallet()).balanceUsdMinor).toBe(133);
    });

    it('never pays a voucher twice or more than the vault holds', async () => {
      await scenario.submit(await scenario.voucher(1, { amountNgnMinor: 801_000, amountUsdMinor: 534 }));
      const over = await scenario.submit(await scenario.voucher(2, { amountNgnMinor: 400_000, amountUsdMinor: 267 }));
      const again = await scenario.submit(await scenario.voucher(1, { amountNgnMinor: 801_000, amountUsdMinor: 534 }));

      expect(over.body.data?.status).toBe('REJECTED_OVERSPEND');
      expect(again.status).toBeLessThan(500);
      expect((await payeeWallet()).balanceUsdMinor).toBe(534);
    });

    it('keeps the books balanced: what left the customer is what the merchant got plus what came back', async () => {
      await scenario.submit(await scenario.voucher(1));
      await scenario.submit(await scenario.voucher(2, { amountNgnMinor: 300_000, amountUsdMinor: 200 }));
      await scenario.melt(2, 333);

      const total = (await payerWallet()).balanceUsdMinor + (await payeeWallet()).balanceUsdMinor;
      expect(total).toBe(1000);
    });

    it('lets the customer lock again from the wallet after the vault closes', async () => {
      await scenario.melt(0, 0);

      const again = await scenario.post('/api/vaults/from-wallet', scenario.payer, LOCK);

      expect(again.status).toBe(201);
    });

    it('is never picked up by hold renewal, which is for PayPal holds only', async () => {
      fixture.time.now = new Date(fixture.time.now.getTime() + 4 * 24 * HOUR_MS);
      await fixture.jobs.runOnce();

      expect(fixture.gateway.reauthorizeCalls).toHaveLength(0);
    });
  });
});
