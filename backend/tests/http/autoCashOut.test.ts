// Money received offline goes on to the receiver's own PayPal by itself: in one payout per run,
// never money they added themselves, never more than the balance, never the same money twice.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import { signingInput } from '@tpay/shared/domain/canonicalJson';
import { createApiFixture } from '../support/apiFixture';
import { createPaymentScenario, HOUR_MS } from '../support/paymentScenario';

describe('Automatic cash-out of money received offline', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let scenario: Awaited<ReturnType<typeof createPaymentScenario>>;
  const wallet = async (who = scenario.payee) =>
    (await request(fixture.app).get('/api/wallet').set('Authorization', `Bearer ${who.deviceToken}`)).body.data;
  const payouts = () => fixture.gateway.payouts;
  const paid = async (sequence: number, amountNgnMinor = 200_000, amountUsdMinor = 133) =>
    scenario.submit(await scenario.voucher(sequence, { amountNgnMinor, amountUsdMinor }));

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    scenario = await createPaymentScenario(fixture);
    fixture.gateway.payouts.length = 0;
  });

  it('sends money received offline to the receiver’s own PayPal, marked as automatic', async () => {
    await paid(1);

    await fixture.jobs.runOnce();

    expect(payouts()).toHaveLength(1);
    expect(payouts()[0]).toMatchObject({ amountUsdMinor: 133, receiverEmail: 'merchant-sandbox@example.com' });
    const { balanceUsdMinor, entries } = await wallet();
    expect(balanceUsdMinor).toBe(0);
    expect(entries[0]).toMatchObject({ type: 'WITHDRAWAL', amountUsdMinor: 133, autoCashOut: true });
  });

  it('sends everything received between two runs as one payout', async () => {
    await paid(1);
    await paid(2, 300_000, 200);

    await fixture.jobs.runOnce();

    expect(payouts()).toHaveLength(1);
    expect(payouts()[0]?.amountUsdMinor).toBe(333);
  });

  it('never sends the same money twice', async () => {
    await paid(1);
    await fixture.jobs.runOnce();
    await fixture.jobs.runOnce();

    expect(payouts()).toHaveLength(1);
  });

  it('sends only what is new on the next run', async () => {
    await paid(1);
    await fixture.jobs.runOnce();
    await paid(2, 300_000, 200);
    await fixture.jobs.runOnce();

    expect(payouts().map((p) => p.amountUsdMinor)).toEqual([133, 200]);
  });

  it('waits until there is at least a dollar', async () => {
    await paid(1, 120_000, 80);

    await fixture.jobs.runOnce();

    expect(payouts()).toHaveLength(0);
    expect((await wallet()).balanceUsdMinor).toBe(80);
  });

  it('never sends money the person added themselves', async () => {
    const add = await scenario.post('/api/wallet/deposits', scenario.payee, { amountNgnMinor: 1_500_000 });
    fixture.gateway.approve(`DEP-ORDER-${fixture.gateway.captureOrders.length}`);
    await scenario.post(`/api/wallet/deposits/${add.body.data.depositId}/complete`, scenario.payee);
    await paid(1);

    await fixture.jobs.runOnce();

    expect(payouts().map((p) => p.amountUsdMinor)).toEqual([133]);
    expect((await wallet()).balanceUsdMinor).toBe(1000);
  });

  it('never sends more than the balance, when the person already withdrew some of it', async () => {
    await paid(1, 801_000, 534);
    await scenario.post('/api/wallet/withdrawals', scenario.payee, { amountUsdMinor: 434 });
    fixture.gateway.payouts.length = 0;

    await fixture.jobs.runOnce();

    expect(payouts().map((p) => p.amountUsdMinor)).toEqual([100]);
    expect((await wallet()).balanceUsdMinor).toBe(0);
  });

  it('does nothing when the person turned it off, and starts again when they turn it on', async () => {
    const turn = (autoCashOut: boolean) => request(fixture.app).patch('/api/profile')
      .set('Authorization', `Bearer ${scenario.payee.deviceToken}`).send({ autoCashOut });
    expect((await turn(false)).body.data.autoCashOut).toBe(false);
    await paid(1);

    await fixture.jobs.runOnce();
    expect(payouts()).toHaveLength(0);

    await turn(true);
    await fixture.jobs.runOnce();
    expect(payouts()).toHaveLength(1);
  });

  it('keeps the choice when the phone registers again', async () => {
    await request(fixture.app).patch('/api/profile').set('Authorization', `Bearer ${scenario.payee.deviceToken}`).send({ autoCashOut: false });
    const payload = { publicKey: scenario.payee.publicKey, displayName: 'Mama Nkechi', language: 'pcm', payoutEmail: 'merchant-sandbox@example.com' };
    const proof = await fixture.signer.sign(signingInput(MESSAGE_PREFIX.REGISTRATION, payload), scenario.payee.privateKey);
    const again = await request(fixture.app).post('/api/devices/register').send({ ...payload, proof });
    const profile = await request(fixture.app).get('/api/profile').set('Authorization', `Bearer ${again.body.data.deviceToken}`);

    expect(profile.body.data.autoCashOut).toBe(false);
  });

  it('gives the money back when PayPal refuses, and leaves the account alone for a day', async () => {
    fixture.gateway.plannedPayouts.push({ outcome: 'REJECTED', reason: 'RECEIVER_UNREGISTERED' });
    await paid(1);

    await fixture.jobs.runOnce();
    expect((await wallet()).balanceUsdMinor).toBe(133);

    await fixture.jobs.runOnce();
    expect(payouts()).toHaveLength(1);

    fixture.time.now = new Date(fixture.time.now.getTime() + 25 * HOUR_MS);
    await fixture.jobs.runOnce();
    expect(payouts()).toHaveLength(2);
  });

  it('does not touch the customer who paid', async () => {
    await paid(1);
    await fixture.jobs.runOnce();

    expect(payouts().every((p) => p.receiverEmail === 'merchant-sandbox@example.com')).toBe(true);
  });
});
