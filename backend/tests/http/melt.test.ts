import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiFixture } from '../support/apiFixture';
import { createPaymentScenario, HOUR_MS } from '../support/paymentScenario';

describe('POST /api/vaults/:id/melt', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let scenario: Awaited<ReturnType<typeof createPaymentScenario>>;

  const vaultRow = () => fixture.vaults.findById(scenario.vaultId);
  const afterSettleBy = () => new Date(fixture.time.now.getTime() + 28 * 24 * HOUR_MS + HOUR_MS);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    scenario = await createPaymentScenario(fixture);
  });

  it('releases an unspent hold at once', async () => {
    const response = await scenario.melt(0, 0);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      vaultId: scenario.vaultId,
      status: 'CLOSED',
      releasedAt: fixture.time.now.toISOString(),
      releaseScheduledFor: null,
      blockingVoucherIds: [],
    });
    expect(fixture.gateway.voidedAuthorizations).toEqual([scenario.vault.paypalAuthorizationId]);
  });

  it('records the released amount in history', async () => {
    await scenario.submit(await scenario.voucher(1));

    await scenario.melt(1, 133);

    const { items } = await fixture.transactions.listForDevice(scenario.payer.deviceId, null, 1);
    expect(items[0]).toMatchObject({
      type: 'VAULT_RELEASED',
      amountUsdMinor: 534,
      amountNgnMinor: 800_000,
      vaultId: scenario.vaultId,
      paypalReferenceId: scenario.vault.paypalAuthorizationId,
    });
  });

  it('releases the rest when every declared voucher has settled', async () => {
    await scenario.submit(await scenario.voucher(1));

    const response = await scenario.melt(1, 133);

    expect(response.body.data.status).toBe('CLOSED');
    expect(fixture.gateway.voidedAuthorizations).toHaveLength(1);
  });

  it('skips the void when the whole hold was captured', async () => {
    await scenario.submit(await scenario.voucher(1, { amountNgnMinor: 1_000_000, amountUsdMinor: 667 }));

    const response = await scenario.melt(1, 667);

    expect(response.body.data.status).toBe('CLOSED');
    expect(fixture.gateway.voidedAuthorizations).toHaveLength(0);
  });

  it('closes when PayPal says the captured hold cannot be voided', async () => {
    await scenario.submit(await scenario.voucher(1));
    fixture.gateway.voidResult = 'ALREADY_CAPTURED';

    const response = await scenario.melt(1, 133);

    expect(response.body.data.status).toBe('CLOSED');
  });

  it('keeps the hold when a declared voucher has not reached the backend', async () => {
    const response = await scenario.melt(1, 133);

    expect(response.body.data).toEqual({
      vaultId: scenario.vaultId,
      status: 'SPEND_CLOSED',
      releasedAt: null,
      releaseScheduledFor: scenario.vault.settleBy,
      blockingVoucherIds: [],
    });
    expect(fixture.gateway.voidedAuthorizations).toHaveLength(0);
  });

  it('names a declared voucher that is still settling', async () => {
    fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
    const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

    const response = await scenario.melt(1, 133);

    expect(response.body.data).toMatchObject({ status: 'SPEND_CLOSED', blockingVoucherIds: [voucherId] });
    expect(fixture.gateway.voidedAuthorizations).toHaveLength(0);
  });

  it('keeps the hold when the declared total is more than what settled', async () => {
    await scenario.submit(await scenario.voucher(1));

    const response = await scenario.melt(1, 500);

    expect(response.body.data.status).toBe('SPEND_CLOSED');
  });

  it('lets a late voucher settle after melt, then releases the rest', async () => {
    const voucher = await scenario.voucher(1);
    await scenario.melt(1, 133);

    const response = await scenario.submit(voucher);

    expect(response.body.data.status).toBe('SETTLED');
    expect((await vaultRow())?.status).toBe('CLOSED');
    expect(fixture.gateway.voidedAuthorizations).toHaveLength(1);
  });

  it('frees the device to lock a new vault once closed', async () => {
    await scenario.melt(0, 0);

    const response = await scenario.post('/api/vaults', scenario.payer, { amountNgnMinor: 500_000, durationHours: 2 });

    expect(response.status).toBe(201);
  });

  it('blocks a voucher beyond the signed statement and raises an alert', async () => {
    const hidden = await scenario.voucher(1);
    await scenario.melt(0, 0);

    const response = await scenario.submit(hidden);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('SETTLEMENT_BLOCKED');
    expect(fixture.gateway.captureCalls).toHaveLength(0);
    expect(await fixture.vouchers.listAlerts(scenario.vaultId)).toMatchObject([{ type: 'STATEMENT_VIOLATION' }]);
  });

  it('repeats safely', async () => {
    await scenario.melt(0, 0);

    const response = await scenario.melt(0, 0);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CLOSED');
    expect(fixture.gateway.voidedAuthorizations).toHaveLength(1);
  });

  it('rejects a forged statement', async () => {
    const forged = await scenario.statement(0, 0, scenario.payee.privateKey);

    const response = await scenario.post(`/api/vaults/${scenario.vaultId}/melt`, scenario.payer, {
      spendStatement: forged,
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_SIGNATURE');
    expect((await vaultRow())?.status).toBe('ACTIVE');
  });

  it('rejects a statement for another vault', async () => {
    const statement = await scenario.statement(0, 0);

    const response = await scenario.post('/api/vaults/vlt_other/melt', scenario.payer, { spendStatement: statement });

    expect(response.status).toBe(404);
  });

  it('hides the vault from another device', async () => {
    const response = await scenario.melt(0, 0, scenario.payee);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('VAULT_NOT_FOUND');
  });

  it('keeps spend-closed state when PayPal is down, so melt can be retried', async () => {
    fixture.gateway.unavailable = true;
    const failed = await scenario.melt(0, 0);
    fixture.gateway.unavailable = false;

    const retried = await scenario.melt(0, 0);

    expect(failed.status).toBe(503);
    expect(retried.body.data.status).toBe('CLOSED');
  });

  describe('release job', () => {
    it('never releases a vault the customer has not melted in T-Pay, even a week later', async () => {
      fixture.time.now = new Date(fixture.time.now.getTime() + 7 * 24 * HOUR_MS);

      await fixture.jobs.runOnce();

      expect((await vaultRow())?.status).toBe('ACTIVE');
      expect(fixture.gateway.voidedAuthorizations).toHaveLength(0);
    });

    it('does nothing before settle-by', async () => {
      await scenario.melt(1, 133);

      await fixture.jobs.runOnce();

      expect((await vaultRow())?.status).toBe('SPEND_CLOSED');
    });

    it('releases a melted vault at settle-by', async () => {
      await scenario.melt(1, 133);
      fixture.time.now = afterSettleBy();

      await fixture.jobs.runOnce();

      const vault = await vaultRow();
      expect(vault).toMatchObject({ status: 'CLOSED', releasedAt: fixture.time.now });
      expect(fixture.gateway.voidedAuthorizations).toHaveLength(1);
    });

    it('releases a vault the person never melted', async () => {
      fixture.time.now = afterSettleBy();

      await fixture.jobs.runOnce();

      expect((await vaultRow())?.status).toBe('CLOSED');
    });

    it('releases a blocked vault at settle-by so the person is not stuck', async () => {
      await scenario.submit(await scenario.voucher(1));
      await scenario.submit(await scenario.voucher(1, { requestNonce: 'other' }));
      fixture.time.now = afterSettleBy();

      await fixture.jobs.runOnce();

      expect((await vaultRow())?.status).toBe('CLOSED');
    });

    it('blocks vouchers still retrying when the hold ends', async () => {
      fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
      const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;
      fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
      fixture.time.now = afterSettleBy();

      await fixture.jobs.runOnce();

      expect((await fixture.vouchers.findById(voucherId))?.status).toBe('SETTLEMENT_BLOCKED');
      expect((await vaultRow())?.status).toBe('CLOSED');
    });

    it('tries again on the next run when PayPal is down', async () => {
      fixture.time.now = afterSettleBy();
      fixture.gateway.unavailable = true;
      await fixture.jobs.runOnce();
      expect((await vaultRow())?.status).toBe('ACTIVE');

      fixture.gateway.unavailable = false;
      await fixture.jobs.runOnce();

      expect((await vaultRow())?.status).toBe('CLOSED');
    });
  });
});
