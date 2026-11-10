import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiFixture } from '../support/apiFixture';
import { createPaymentScenario, HOUR_MS } from '../support/paymentScenario';




const DAY_MS = 24 * HOUR_MS;


describe('vault hold renewal', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let scenario: Awaited<ReturnType<typeof createPaymentScenario>>;
  let lockedAt: number;

  const vaultRow = () => fixture.vaults.findById(scenario.vaultId);
  const advanceTo = (days: number, extraMs = 0) => {
    fixture.time.now = new Date(lockedAt + days * DAY_MS + extraMs);
  };

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    scenario = await createPaymentScenario(fixture);
    lockedAt = fixture.time.now.getTime();
  });


  it('does nothing during the first three-day honor period', async () => {
    advanceTo(3, -1);

    await fixture.jobs.runOnce();

    expect(fixture.gateway.reauthorizeCalls).toHaveLength(0);
  });

  it('reauthorizes the hold when the honor period ends and uses the new ID from then on', async () => {
    const signedOffline = await scenario.voucher(1);
    advanceTo(3);

    await fixture.jobs.runOnce();

    expect(fixture.gateway.reauthorizeCalls).toEqual([{
      authorizationId: 'AUTH-ORDER-1',
      requestId: 'AUTH-ORDER-1-reauthorize',
      amountUsdMinor: 667,
    }]);
    expect(await vaultRow()).toMatchObject({
      status: 'ACTIVE',
      paypalAuthorizationId: 'AUTH-ORDER-1-R1',
      honorEndsAt: new Date(lockedAt + 6 * DAY_MS),
    });

    await scenario.submit(signedOffline);
    expect(fixture.gateway.captureCalls.at(-1)?.authorizationId).toBe('AUTH-ORDER-1-R1');
  });

  it('reauthorizes only what has not been captured', async () => {
    await scenario.submit(await scenario.voucher(1));
    advanceTo(3);

    await fixture.jobs.runOnce();

    expect(fixture.gateway.reauthorizeCalls[0]?.amountUsdMinor).toBe(534);
  });

  it('keeps the money held for a week while nobody comes back to T-Pay', async () => {
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      advanceTo(day);
      await fixture.jobs.runOnce();
    }

    expect((await vaultRow())?.status).toBe('ACTIVE');
    expect(fixture.gateway.voidedAuthorizations).toHaveLength(0);
    expect(fixture.gateway.reauthorizeCalls.map(({ authorizationId }) => authorizationId))
      .toEqual(['AUTH-ORDER-1', 'AUTH-ORDER-1-R1']);
  });

  it('then settles a voucher signed on day one that the merchant brings in on day eight', async () => {
    const signedOffline = await scenario.voucher(1);
    for (const day of [3, 6]) {
      advanceTo(day);
      await fixture.jobs.runOnce();
    }
    advanceTo(8);

    const response = await scenario.submit(signedOffline);

    expect(response.body.data.status).toBe('SETTLED');
    expect(fixture.gateway.captureCalls.at(-1)?.authorizationId).toBe('AUTH-ORDER-1-R1-R2');
  });

  it('keeps renewing a melted vault that is still waiting for a declared voucher', async () => {
    await scenario.melt(1, 133);
    advanceTo(3);

    await fixture.jobs.runOnce();

    expect(await vaultRow()).toMatchObject({ status: 'SPEND_CLOSED', paypalAuthorizationId: 'AUTH-ORDER-1-R1' });
  });

  it('waits for a capture in progress before replacing the authorization', async () => {
    const { voucherId } = (await scenario.submit(await scenario.voucher(1, {}), scenario.payee)).body.data;
    advanceTo(3);
    await fixture.vouchers.withVaultLock(scenario.vaultId, (session) =>
      session.updateVoucher(voucherId, { status: 'SETTLING', leaseUntil: new Date(fixture.time.now.getTime() + 60_000) }));

    await fixture.jobs.runOnce();

    expect(fixture.gateway.reauthorizeCalls).toHaveLength(0);
  });

  it('tries again in an hour when PayPal does not answer', async () => {
    fixture.gateway.plannedReauthorizations.push({ outcome: 'RETRY' });
    advanceTo(3);

    await fixture.jobs.runOnce();

    expect(await vaultRow()).toMatchObject({
      paypalAuthorizationId: 'AUTH-ORDER-1',
      honorEndsAt: new Date(lockedAt + 3 * DAY_MS + HOUR_MS),
    });
    expect(await fixture.vouchers.listAlerts(scenario.vaultId)).toEqual([]);
  });

  it('raises an alert and tries again tomorrow when PayPal refuses', async () => {
    fixture.gateway.plannedReauthorizations.push({ outcome: 'REFUSED', reason: 'INSUFFICIENT_FUNDS' });
    advanceTo(3);

    await fixture.jobs.runOnce();

    expect(await vaultRow()).toMatchObject({
      paypalAuthorizationId: 'AUTH-ORDER-1',
      honorEndsAt: new Date(lockedAt + 4 * DAY_MS),
    });
    expect(await fixture.vouchers.listAlerts(scenario.vaultId)).toMatchObject([{
      type: 'REAUTHORIZATION_FAILED',
      details: { reason: 'INSUFFICIENT_FUNDS', authorizationId: 'AUTH-ORDER-1', amountUsdMinor: 667 },
    }]);
  });

  it('stops renewing once everything has been captured', async () => {
    await scenario.submit(await scenario.voucher(1, { amountNgnMinor: 1_000_000, amountUsdMinor: 667 }));
    advanceTo(3);

    await fixture.jobs.runOnce();

    expect(fixture.gateway.reauthorizeCalls).toHaveLength(0);
    expect((await vaultRow())?.honorEndsAt).toBeNull();
  });

  it('stops renewing a vault the customer has melted and closed', async () => {
    await scenario.melt(0, 0);
    advanceTo(3);

    await fixture.jobs.runOnce();

    expect(fixture.gateway.reauthorizeCalls).toHaveLength(0);
  });

  it('ignores a void notice for an authorization it has already replaced', async () => {
    advanceTo(3);
    await fixture.jobs.runOnce();

    const response = await request(fixture.app).post('/api/webhooks/paypal').send({
      id: 'WH-1',
      event_type: 'PAYMENT.AUTHORIZATION.VOIDED',
      resource: { id: 'AUTH-ORDER-1' },
    });

    expect(response.status).toBe(200);
    expect((await vaultRow())?.status).toBe('ACTIVE');
  });
});
