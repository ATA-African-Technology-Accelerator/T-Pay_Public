import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiFixture } from '../support/apiFixture';
import { createPaymentScenario } from '../support/paymentScenario';
import { inMemoryStorage, postgresStorage, type Storage } from '../support/storage';
import { testDatabaseUrl } from '../support/testDatabase';

const implementations = [
  { name: 'in memory', create: inMemoryStorage },
  ...(testDatabaseUrl ? [{ name: 'Postgres', create: postgresStorage }] : []),
];

describe.each(implementations)('$name settlement under load', ({ create }) => {
  let close: () => Promise<void>;
  let storage: Storage;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ({ close, storage } = await create());
  });

  afterEach(async () => {
    await close();
  });

  it('turns 100 duplicate submissions into one capture and one credit', async () => {
    const fixture = await createApiFixture({ storage });
    const scenario = await createPaymentScenario(fixture);
    const voucher = await scenario.voucher(1);

    const responses = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        scenario.submit(voucher, index % 2 ? scenario.payee : scenario.payer)),
    );

    expect(responses.every(({ status }) => status === 200 || status === 202)).toBe(true);
    expect(fixture.gateway.captureCalls).toHaveLength(1);
    expect(responses.filter(({ body }) => !body.data.replay)).toHaveLength(1);
    expect(await fixture.vouchers.listLedgerForDevice(scenario.payee.deviceId)).toHaveLength(1);
  });

  it('never captures more than the hold when different vouchers race', async () => {
    const fixture = await createApiFixture({ storage });
    const scenario = await createPaymentScenario(fixture);
    const vouchers = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        scenario.voucher(index + 1, { amountNgnMinor: 150_000, amountUsdMinor: 100 })),
    );

    await Promise.all(vouchers.map((voucher) => scenario.submit(voucher)));
    for (let run = 0; run < 25; run += 1) {
      fixture.time.now = new Date(fixture.time.now.getTime() + 1000);
      await fixture.jobs.runOnce();
    }

    const total = fixture.gateway.captures.reduce((sum, { amountUsdMinor }) => sum + amountUsdMinor, 0);
    expect(total).toBeLessThanOrEqual(667);
    expect(new Set(fixture.gateway.captures.map(({ invoiceId }) => invoiceId)).size).toBe(fixture.gateway.captures.length);
    expect((await fixture.vaults.findById(scenario.vaultId))?.status).toBe('BLOCKED');
  });

  it('pays out once when many withdrawals race for one balance', async () => {
    const fixture = await createApiFixture({ storage });
    const scenario = await createPaymentScenario(fixture);
    await scenario.submit(await scenario.voucher(1));

    const responses = await Promise.all(
      Array.from({ length: 30 }, () =>
        scenario.post('/api/wallet/withdrawals', scenario.payee, { amountUsdMinor: 100 })),
    );

    expect(responses.filter(({ status }) => status === 202)).toHaveLength(1);
    expect(fixture.gateway.payouts).toHaveLength(1);
  });
});
