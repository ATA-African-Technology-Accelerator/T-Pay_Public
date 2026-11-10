import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiFixture } from '../support/apiFixture';
import { createPaymentScenario, HOUR_MS } from '../support/paymentScenario';

describe('voucher API', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let scenario: Awaited<ReturnType<typeof createPaymentScenario>>;

  const errorCode = (response: { body: { error?: { code: string } } }) => response.body.error?.code;
  const stored = (voucherId: string) => fixture.vouchers.findById(voucherId);

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    scenario = await createPaymentScenario(fixture);
  });

  describe('POST /api/vouchers', () => {
    it('settles a valid voucher', async () => {
      const response = await scenario.submit(await scenario.voucher(1));

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        voucherId: expect.stringMatching(/^vch_/),
        status: 'SETTLED',
        paypalCaptureId: 'CAPTURE-1',
        replay: false,
      });
    });

    it('captures part of the hold with stable identifiers', async () => {
      const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

      expect(fixture.gateway.captures[0]).toMatchObject({
        authorizationId: scenario.vault.paypalAuthorizationId,
        requestId: `${voucherId}-capture`,
        invoiceId: voucherId,
        amountUsdMinor: 133,
      });
    });

    it('credits the payee and records history for both people', async () => {
      const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

      const ledger = await fixture.vouchers.listLedgerForDevice(scenario.payee.deviceId);
      const history = async (deviceId: string) =>
        (await fixture.transactions.listForDevice(deviceId, null, 10)).items.map(({ type }) => type);

      expect(ledger).toMatchObject([
        { type: 'CREDIT', amountUsdMinor: 133, amountNgnMinor: 200_000, voucherId, paypalCaptureId: 'CAPTURE-1' },
      ]);
      expect(await history(scenario.payee.deviceId)).toEqual(['VOUCHER_SETTLED', 'VOUCHER_SUBMITTED']);
      expect(await history(scenario.payer.deviceId)).toEqual(['VOUCHER_SETTLED', 'VOUCHER_SUBMITTED', 'VAULT_LOCKED']);
    });

    it('accepts the voucher from the payer too', async () => {
      const response = await scenario.submit(await scenario.voucher(1), scenario.payer);

      expect(response.body.data.status).toBe('SETTLED');
    });

    it('accepts a matching receipt', async () => {
      const voucher = await scenario.voucher(1);

      const response = await scenario.submit(voucher, scenario.payee, { receipt: await scenario.receipt(voucher) });

      expect(response.status).toBe(200);
    });

    it('settles vouchers in any arrival order', async () => {
      const second = await scenario.submit(await scenario.voucher(2));
      const first = await scenario.submit(await scenario.voucher(1));

      expect(second.body.data.status).toBe('SETTLED');
      expect(first.body.data.status).toBe('SETTLED');
    });

    it('replays an identical voucher with no second capture', async () => {
      const voucher = await scenario.voucher(1);
      const first = await scenario.submit(voucher);

      const replay = await scenario.submit(voucher, scenario.payer);

      expect(replay.status).toBe(200);
      expect(replay.body.data).toEqual({ ...first.body.data, replay: true });
      expect(fixture.gateway.captureCalls).toHaveLength(1);
    });

    it('still replays long after settle-by', async () => {
      const voucher = await scenario.voucher(1);
      await scenario.submit(voucher);
      fixture.time.now = new Date(fixture.time.now.getTime() + 500 * HOUR_MS);

      const replay = await scenario.submit(voucher);

      expect(replay.body.data).toMatchObject({ status: 'SETTLED', replay: true });
    });

    describe('verification', () => {
      it('requires a device token', async () => {
        const response = await scenario.post('/api/vouchers', { ...scenario.payee, deviceToken: 'wrong' }, {});

        expect(response.status).toBe(401);
      });

      it('rejects a malformed body', async () => {
        const response = await scenario.post('/api/vouchers', scenario.payee, { voucher: {} });

        expect(errorCode(response)).toBe('VALIDATION_FAILED');
      });

      it('rejects a forged voucher signature', async () => {
        const forged = await scenario.voucher(1, {}, scenario.payee.privateKey);

        const response = await scenario.submit(forged);

        expect(response.status).toBe(422);
        expect(errorCode(response)).toBe('INVALID_SIGNATURE');
      });

      it('rejects a changed amount', async () => {
        const signed = await scenario.voucher(1);
        const changed = { ...signed, payload: { ...signed.payload, amountUsdMinor: 1 } };

        expect(errorCode(await scenario.submit(changed))).toBe('INVALID_SIGNATURE');
      });

      it('rejects a forged vault certificate', async () => {
        const { vaultCertificate } = scenario;
        const forged = {
          ...vaultCertificate,
          payload: { ...vaultCertificate.payload, authorisedUsdMinor: 99_999 },
        };

        const response = await scenario.post('/api/vouchers', scenario.payee, {
          voucher: await scenario.voucher(1),
          vaultCertificate: forged,
        });

        expect(errorCode(response)).toBe('INVALID_CERTIFICATE');
      });

      it('rejects a voucher signed at the wrong rate', async () => {
        const voucher = await scenario.voucher(1, { amountUsdMinor: 1 });

        expect(errorCode(await scenario.submit(voucher))).toBe('VALIDATION_FAILED');
        expect(fixture.gateway.captureCalls).toHaveLength(0);
      });

      it('rejects a voucher for an unknown payee', async () => {
        const voucher = await scenario.voucher(1, { payeeKeyId: 'key_nobody' });

        expect(errorCode(await scenario.submit(voucher, scenario.payer))).toBe('VALIDATION_FAILED');
      });

      it('rejects a person paying themselves', async () => {
        const voucher = await scenario.voucher(1, { payeeKeyId: scenario.payer.keyId });

        expect(errorCode(await scenario.submit(voucher, scenario.payer))).toBe('VALIDATION_FAILED');
      });

      it('refuses a device that is not a party to the voucher', async () => {
        const stranger = await fixture.registerDevice('Stranger');

        const response = await scenario.submit(await scenario.voucher(1), stranger);

        expect(response.status).toBe(403);
        expect(errorCode(response)).toBe('NOT_A_PARTY');
      });

      it('rejects a receipt for different content', async () => {
        const voucher = await scenario.voucher(1);
        const receipt = await scenario.receipt(voucher, { voucherHash: 'other' });

        const response = await scenario.submit(voucher, scenario.payee, { receipt });

        expect(errorCode(response)).toBe('INVALID_SIGNATURE');
      });

      it('refuses a voucher signed after spend-by', async () => {
        const issuedAt = new Date(fixture.time.now.getTime() + 25 * HOUR_MS).toISOString();

        const response = await scenario.submit(await scenario.voucher(1, { issuedAt }));

        expect(response.status).toBe(422);
        expect(errorCode(response)).toBe('VOUCHER_EXPIRED');
      });

      it('refuses a new voucher after settle-by', async () => {
        const voucher = await scenario.voucher(1);
        fixture.time.now = new Date(fixture.time.now.getTime() + 28 * 24 * HOUR_MS + HOUR_MS);

        expect(errorCode(await scenario.submit(voucher))).toBe('VOUCHER_EXPIRED');
      });

      it('still settles a voucher a merchant brings in a week after spend-by', async () => {
        const voucher = await scenario.voucher(1);
        fixture.time.now = new Date(fixture.time.now.getTime() + 8 * 24 * HOUR_MS);

        const response = await scenario.submit(voucher);

        expect(response.body.data.status).toBe('SETTLED');
      });
    });

    describe('conflict', () => {
      it('rejects different content on a used sequence, blocks the vault and raises an alert', async () => {
        const first = await scenario.submit(await scenario.voucher(1));

        const response = await scenario.submit(await scenario.voucher(1, { requestNonce: 'other' }));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
          voucherId: first.body.data.voucherId,
          status: 'REJECTED_CONFLICT',
          paypalCaptureId: null,
          replay: false,
        });
        expect((await fixture.vaults.findById(scenario.vaultId))?.status).toBe('BLOCKED');
        expect(await fixture.vouchers.listAlerts(scenario.vaultId)).toMatchObject([{ type: 'VOUCHER_CONFLICT' }]);
        expect(fixture.gateway.captureCalls).toHaveLength(1);
      });

      it('keeps the first settled voucher', async () => {
        const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

        await scenario.submit(await scenario.voucher(1, { requestNonce: 'other' }));

        expect((await stored(voucherId))?.status).toBe('SETTLED');
      });

      it('holds later vouchers on a blocked vault', async () => {
        await scenario.submit(await scenario.voucher(1));
        await scenario.submit(await scenario.voucher(1, { requestNonce: 'other' }));

        const response = await scenario.submit(await scenario.voucher(2));

        expect(response.body.data.status).toBe('SETTLEMENT_BLOCKED');
        expect(fixture.gateway.captureCalls).toHaveLength(1);
      });
    });

    describe('overspend', () => {
      it('rejects a voucher above what is left, blocks the vault and raises an alert', async () => {
        await scenario.submit(await scenario.voucher(1, { amountNgnMinor: 800_000, amountUsdMinor: 533 }));

        const response = await scenario.submit(
          await scenario.voucher(2, { amountNgnMinor: 300_000, amountUsdMinor: 200 }),
        );

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('REJECTED_OVERSPEND');
        expect((await fixture.vaults.findById(scenario.vaultId))?.status).toBe('BLOCKED');
        expect(await fixture.vouchers.listAlerts(scenario.vaultId)).toMatchObject([{ type: 'VOUCHER_OVERSPEND' }]);
        expect(fixture.gateway.captures).toHaveLength(1);
      });

      it('allows spending exactly the whole hold', async () => {
        const response = await scenario.submit(
          await scenario.voucher(1, { amountNgnMinor: 1_000_000, amountUsdMinor: 667 }),
        );

        expect(response.body.data.status).toBe('SETTLED');
      });
    });

    describe('PayPal failures', () => {
      it('reports continuing settlement with 202 when PayPal fails', async () => {
        fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });

        const response = await scenario.submit(await scenario.voucher(1));

        expect(response.status).toBe(202);
        expect(response.body.data).toMatchObject({ status: 'RETRYABLE_FAILURE', paypalCaptureId: null });
      });

      it('reads back after a timeout and settles without a second capture', async () => {
        fixture.gateway.plannedCaptures.push('TIMEOUT_AFTER_CAPTURE');

        const response = await scenario.submit(await scenario.voucher(1));

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ status: 'SETTLED', paypalCaptureId: 'CAPTURE-1' });
        expect(fixture.gateway.captureCalls).toHaveLength(1);
      });

      it('waits at least the backoff before retrying', async () => {
        fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
        await scenario.submit(await scenario.voucher(1));

        await fixture.jobs.runOnce();
        expect(fixture.gateway.captureCalls).toHaveLength(1);

        fixture.time.now = new Date(fixture.time.now.getTime() + 37_000);
        await fixture.jobs.runOnce();
        expect(fixture.gateway.captureCalls).toHaveLength(2);
      });

      it('settles on retry with the same PayPal request id', async () => {
        fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
        const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

        fixture.time.now = new Date(fixture.time.now.getTime() + 37_000);
        await fixture.jobs.runOnce();

        const [first, second] = fixture.gateway.captureCalls;
        expect(second?.requestId).toBe(first?.requestId);
        expect((await stored(voucherId))?.status).toBe('SETTLED');
      });

      it('blocks an expired authorization without retrying', async () => {
        fixture.gateway.plannedCaptures.push({ outcome: 'BLOCKED', reason: 'AUTHORIZATION_EXPIRED' });

        const response = await scenario.submit(await scenario.voucher(1));

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('SETTLEMENT_BLOCKED');
        expect(await fixture.vouchers.listAlerts(scenario.vaultId)).toMatchObject([
          { type: 'SETTLEMENT_BLOCKED', details: { reason: 'AUTHORIZATION_EXPIRED' } },
        ]);

        fixture.time.now = new Date(fixture.time.now.getTime() + HOUR_MS);
        await fixture.jobs.runOnce();
        expect(fixture.gateway.captureCalls).toHaveLength(1);
      });

      it('gives its blocked amount back to the vault', async () => {
        fixture.gateway.plannedCaptures.push({ outcome: 'BLOCKED', reason: 'CAPTURE_DECLINED' });
        await scenario.submit(await scenario.voucher(1, { amountNgnMinor: 1_000_000, amountUsdMinor: 667 }));

        const response = await scenario.submit(await scenario.voucher(2));

        expect(response.body.data.status).toBe('SETTLED');
      });

      it('leaves a pending capture for the webhook to finish', async () => {
        fixture.gateway.plannedCaptures.push({ outcome: 'PENDING', captureId: 'CAPTURE-P' });

        const response = await scenario.submit(await scenario.voucher(1));

        expect(response.status).toBe(202);
        expect(response.body.data).toMatchObject({ status: 'SETTLING', paypalCaptureId: 'CAPTURE-P' });

        fixture.time.now = new Date(fixture.time.now.getTime() + HOUR_MS);
        await fixture.jobs.runOnce();
        expect(fixture.gateway.captureCalls).toHaveLength(1);
      });

      it('stops retrying and blocks after the last attempt', async () => {
        const failures = Array.from({ length: 8 }, () => ({ outcome: 'RETRY' as const }));
        fixture.gateway.plannedCaptures.push(...failures);
        const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

        for (let run = 0; run < 8; run += 1) {
          fixture.time.now = new Date(fixture.time.now.getTime() + HOUR_MS);
          await fixture.jobs.runOnce();
        }

        expect((await stored(voucherId))?.status).toBe('SETTLEMENT_BLOCKED');
        expect(fixture.gateway.captureCalls).toHaveLength(8);
      });
    });
  });

  describe('vault balance', () => {
    it('shows settled and reserved amounts on the current vault', async () => {
      await scenario.submit(await scenario.voucher(1));
      fixture.gateway.plannedCaptures.push({ outcome: 'RETRY' });
      await scenario.submit(await scenario.voucher(2, { amountNgnMinor: 300_000, amountUsdMinor: 200 }));

      const { vault } = (await scenario.get('/api/vaults/current', scenario.payer)).body.data;

      expect(vault).toMatchObject({
        authorisedUsdMinor: 667,
        settledUsdMinor: 133,
        reservedUsdMinor: 200,
        remainingUsdMinor: 334,
      });
    });
  });

  describe('GET /api/vouchers', () => {
    it('shows each person their own side', async () => {
      const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

      const asPayee = await scenario.get('/api/vouchers', scenario.payee);
      const asPayer = await scenario.get('/api/vouchers', scenario.payer);

      expect(asPayee.body.data).toEqual({
        items: [
          {
            voucherId,
            vaultId: scenario.vaultId,
            sequence: 1,
            view: 'PAYEE',
            status: 'SETTLED',
            amountNgnMinor: 200_000,
            amountUsdMinor: 133,
            counterpartyName: 'Customer',
            paypalCaptureId: 'CAPTURE-1',
            updatedAt: fixture.time.now.toISOString(),
          },
        ],
        nextCursor: null,
      });
      expect(asPayer.body.data.items[0]).toMatchObject({ view: 'PAYER', counterpartyName: 'Mama Nkechi' });
    });

    it('never shows a stranger the voucher', async () => {
      await scenario.submit(await scenario.voucher(1));
      const stranger = await fixture.registerDevice('Stranger');

      expect((await scenario.get('/api/vouchers', stranger)).body.data.items).toEqual([]);
    });

    it('pages with since and limit', async () => {
      for (const sequence of [1, 2, 3]) {
        await scenario.submit(await scenario.voucher(sequence, { amountNgnMinor: 15_000, amountUsdMinor: 10 }));
      }

      const first = await scenario.get('/api/vouchers?limit=2', scenario.payee);
      const second = await scenario.get(`/api/vouchers?limit=2&since=${first.body.data.nextCursor}`, scenario.payee);

      expect(first.body.data.items.map((item: { sequence: number }) => item.sequence)).toEqual([3, 2]);
      expect(second.body.data.items.map((item: { sequence: number }) => item.sequence)).toEqual([1]);
      expect(second.body.data.nextCursor).toBeNull();
    });
  });

  describe('GET /api/vouchers/:id', () => {
    it('returns the voucher to a party', async () => {
      const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;

      const response = await scenario.get(`/api/vouchers/${voucherId}`, scenario.payer);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ voucherId, view: 'PAYER' });
    });

    it('hides the voucher from everyone else', async () => {
      const { voucherId } = (await scenario.submit(await scenario.voucher(1))).body.data;
      const stranger = await fixture.registerDevice('Stranger');

      const response = await scenario.get(`/api/vouchers/${voucherId}`, stranger);

      expect(response.status).toBe(404);
      expect(errorCode(response)).toBe('VOUCHER_NOT_FOUND');
    });
  });
});
