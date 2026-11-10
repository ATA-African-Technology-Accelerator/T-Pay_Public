import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import { verifyMessage } from '@tpay/shared/domain/signedMessages';
import { NOW, createApiFixture } from '../support/apiFixture';

const HOUR_MS = 60 * 60 * 1000;
const ORDER = { amountNgnMinor: 1_000_000, durationHours: 24 };

describe('vault API', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let device: { deviceId: string; keyId: string; deviceToken: string };

  const post = (path: string, token: string, body: object = {}, key: string = randomUUID()) =>
    request(fixture.app)
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);
  const create = (body: object = ORDER, key?: string) => post('/api/vaults', device.deviceToken, body, key);
  const authorize = (vaultId: string, token = device.deviceToken, key?: string) =>
    post(`/api/vaults/${vaultId}/authorize`, token, {}, key);
  const current = () =>
    request(fixture.app).get('/api/vaults/current').set('Authorization', `Bearer ${device.deviceToken}`);
  const paypalReturn = (query: Record<string, string>) =>
    request(fixture.app).get('/api/paypal/return').query(query);

  const lockVault = async () => {
    const { body } = await create();
    fixture.gateway.approve(`ORDER-${fixture.gateway.orders.length}`);
    await authorize(body.data.vaultId);
    return body.data.vaultId as string;
  };

  beforeEach(async () => {
    fixture = await createApiFixture();
    device = await fixture.registerDevice();
  });

  describe('POST /api/vaults', () => {
    it('creates a PayPal order and returns the contract shape', async () => {
      const response = await create();

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual({
        vaultId: expect.stringMatching(/^vlt_/),
        status: 'PENDING_APPROVAL',
        amountNgnMinor: 1_000_000,
        amountUsdMinor: 667,
        fxRate: '1500.00',
        approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1',
      });
    });

    it('sends PayPal our return pages and a stable request id', async () => {
      const { body } = await create();
      const { vaultId } = body.data;

      expect(fixture.gateway.orders[0]).toEqual({
        requestId: `${vaultId}-order`,
        vaultId,
        amountUsdMinor: 667,
        returnUrl: `https://tpay.test/api/paypal/return?vaultId=${vaultId}&outcome=approved`,
        cancelUrl: `https://tpay.test/api/paypal/return?vaultId=${vaultId}&outcome=cancelled`,
      });
    });

    it('requires a device token', async () => {
      const response = await request(fixture.app).post('/api/vaults').send(ORDER);

      expect(response.status).toBe(401);
    });

    it('requires an idempotency key', async () => {
      const response = await request(fixture.app)
        .post('/api/vaults')
        .set('Authorization', `Bearer ${device.deviceToken}`)
        .send(ORDER);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it.each([
      ['a duration over the 24 hour limit', { amountNgnMinor: 1_000_000, durationHours: 25 }],
      ['a duration of zero', { amountNgnMinor: 1_000_000, durationHours: 0 }],
      ['a fractional amount', { amountNgnMinor: 100.5, durationHours: 24 }],
      ['an amount below one US cent', { amountNgnMinor: 1, durationHours: 24 }],
      ['an unknown field', { ...ORDER, extra: true }],
    ])('rejects %s', async (_name, body) => {
      const response = await create(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(fixture.gateway.orders).toHaveLength(0);
    });

    it('answers a repeated request with the same vault and one PayPal order', async () => {
      const key = randomUUID();

      const first = await create(ORDER, key);
      const second = await create(ORDER, key);

      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(fixture.gateway.orders).toHaveLength(1);
    });

    it('refuses the same key with a different body', async () => {
      const key = randomUUID();
      await create(ORDER, key);

      const response = await create({ ...ORDER, durationHours: 12 }, key);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('lets the app retry the same key after PayPal was down', async () => {
      const key = randomUUID();
      fixture.gateway.unavailable = true;
      const failed = await create(ORDER, key);
      fixture.gateway.unavailable = false;

      const retried = await create(ORDER, key);

      expect(failed.status).toBe(503);
      expect(failed.body.error.code).toBe('PAYPAL_UNAVAILABLE');
      expect(retried.status).toBe(201);
    });

    it('refuses a second vault while one is active', async () => {
      await lockVault();

      const response = await create();

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ACTIVE_VAULT_EXISTS');
    });

    it('replaces an order the person never finished', async () => {
      const first = await create();

      const second = await create();

      expect(second.status).toBe(201);
      expect((await fixture.vaults.findById(first.body.data.vaultId))?.status).toBe('CLOSED');
      expect((await fixture.vaults.findOpenForDevice(device.deviceId))?.id).toBe(second.body.data.vaultId);
    });

    it('keeps the unfinished order when PayPal cannot make a new one', async () => {
      const first = await create();
      fixture.gateway.unavailable = true;

      await create();

      expect((await fixture.vaults.findById(first.body.data.vaultId))?.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('GET /api/paypal/return', () => {
    it('sends an approved person back to the app', async () => {
      const response = await paypalReturn({ vaultId: 'vlt_1', outcome: 'approved', token: 'ORDER-1' });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('tpay://vault/return?vaultId=vlt_1&outcome=approved');
    });

    it('closes the pending vault on cancel so the person can start again', async () => {
      const { vaultId } = (await create()).body.data;

      const response = await paypalReturn({ vaultId, outcome: 'cancelled', token: 'ORDER-1' });

      expect(response.headers.location).toBe(`tpay://vault/return?vaultId=${vaultId}&outcome=cancelled`);
      expect((await fixture.vaults.findById(vaultId))?.status).toBe('CLOSED');
    });

    it('ignores a cancel that does not carry the PayPal order token', async () => {
      const { vaultId } = (await create()).body.data;

      await paypalReturn({ vaultId, outcome: 'cancelled', token: 'WRONG' });

      expect((await fixture.vaults.findById(vaultId))?.status).toBe('PENDING_APPROVAL');
    });

    it('rejects an unknown outcome', async () => {
      const response = await paypalReturn({ vaultId: 'vlt_1', outcome: 'maybe' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/vaults/:id/authorize', () => {
    const approvedVault = async () => {
      const { vaultId } = (await create()).body.data;
      fixture.gateway.approve('ORDER-1');
      return vaultId as string;
    };

    it('locks the funds and returns the vault', async () => {
      const response = await authorize(await approvedVault());

      expect(response.status).toBe(200);
      expect(response.body.data.vault).toEqual({
        vaultId: expect.stringMatching(/^vlt_/),
        status: 'ACTIVE',
        amountNgnMinor: 1_000_000,
        fxRate: '1500.00',
        authorisedUsdMinor: 667,
        reservedUsdMinor: 0,
        settledUsdMinor: 0,
        remainingUsdMinor: 667,
        spendBy: new Date(NOW.getTime() + 24 * HOUR_MS).toISOString(),
        settleBy: new Date(NOW.getTime() + 28 * 24 * HOUR_MS).toISOString(),
        paypalAuthorizationId: 'AUTH-ORDER-1',
      });
    });

    it('starts the spending window from the chosen duration', async () => {
      const { vaultId } = (await create({ ...ORDER, durationHours: 2 })).body.data;
      fixture.gateway.approve('ORDER-1');

      const { vault } = (await authorize(vaultId)).body.data;

      expect(vault.spendBy).toBe(new Date(NOW.getTime() + 2 * HOUR_MS).toISOString());
      expect(vault.settleBy).toBe(new Date(NOW.getTime() + 28 * 24 * HOUR_MS).toISOString());
    });

    it('waits until a day before PayPal says the hold expires, when that is sooner', async () => {
      fixture.gateway.authorizationExpiresAt = new Date(NOW.getTime() + 10 * 24 * HOUR_MS);

      const { vault } = (await authorize(await approvedVault())).body.data;

      expect(vault.settleBy).toBe(new Date(NOW.getTime() + 9 * 24 * HOUR_MS).toISOString());
    });

    it('never waits longer than PayPal’s 29-day hold, whatever expiry PayPal reports', async () => {
      fixture.gateway.authorizationExpiresAt = new Date(NOW.getTime() + 60 * 24 * HOUR_MS);

      const { vault } = (await authorize(await approvedVault())).body.data;

      expect(vault.settleBy).toBe(new Date(NOW.getTime() + 28 * 24 * HOUR_MS).toISOString());
    });

    it('issues a vault certificate signed by the root key', async () => {
      const vaultId = await approvedVault();

      const { vaultCertificate, vault } = (await authorize(vaultId)).body.data;

      expect(vaultCertificate.payload).toEqual({
        vaultId,
        keyId: device.keyId,
        authorisedUsdMinor: 667,
        amountNgnMinor: 1_000_000,
        fxRate: '1500.00',
        spendBy: vault.spendBy,
        settleBy: vault.settleBy,
      });
      expect(
        await verifyMessage(
          MESSAGE_PREFIX.VAULT_CERTIFICATE,
          vaultCertificate,
          fixture.root.publicKey,
          fixture.signer,
        ),
      ).toBe(true);
    });

    it('records the lock in the transaction history', async () => {
      const vaultId = await approvedVault();

      await authorize(vaultId);
      const { items } = await fixture.transactions.listForDevice(device.deviceId, null, 10);

      expect(items).toEqual([
        {
          id: `txn_${vaultId}_locked`,
          deviceId: device.deviceId,
          type: 'VAULT_LOCKED',
          amountNgnMinor: 1_000_000,
          amountUsdMinor: 667,
          vaultId,
          voucherId: null,
          paypalReferenceId: 'AUTH-ORDER-1',
          occurredAt: NOW,
        },
      ]);
    });

    it('calls PayPal once when the app repeats the request with a new key', async () => {
      const vaultId = await approvedVault();

      const first = await authorize(vaultId);
      const second = await authorize(vaultId);

      expect(second.status).toBe(200);
      expect(second.body.data.vault).toEqual(first.body.data.vault);
      expect(fixture.gateway.authorizeCalls).toHaveLength(1);
    });

    it('sends PayPal a stable request id', async () => {
      const vaultId = await approvedVault();

      await authorize(vaultId);

      expect(fixture.gateway.authorizeCalls[0]).toEqual({
        requestId: `${vaultId}-authorize`,
        orderId: 'ORDER-1',
      });
    });

    it('refuses an order the person has not approved', async () => {
      const { vaultId } = (await create()).body.data;

      const response = await authorize(vaultId);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ORDER_NOT_APPROVED');
      expect((await fixture.vaults.findById(vaultId))?.status).toBe('PENDING_APPROVAL');
    });

    it('hides the vault of another device', async () => {
      const vaultId = await approvedVault();
      const stranger = await fixture.registerDevice();

      const response = await authorize(vaultId, stranger.deviceToken);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('VAULT_NOT_FOUND');
      expect(fixture.gateway.authorizeCalls).toHaveLength(0);
    });

    it('refuses a vault the person cancelled', async () => {
      const vaultId = await approvedVault();
      await paypalReturn({ vaultId, outcome: 'cancelled', token: 'ORDER-1' });

      const response = await authorize(vaultId);

      expect(response.status).toBe(404);
    });

    it('reports when PayPal is down and locks nothing', async () => {
      const vaultId = await approvedVault();
      fixture.gateway.unavailable = true;

      const response = await authorize(vaultId);

      expect(response.status).toBe(503);
      expect((await fixture.vaults.findById(vaultId))?.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('GET /api/vaults/current', () => {
    it('returns null when nothing is locked', async () => {
      const response = await current();

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ vault: null });
    });

    it('returns null while PayPal approval is still pending', async () => {
      await create();

      expect((await current()).body.data).toEqual({ vault: null });
    });

    it('returns the locked vault', async () => {
      const vaultId = await lockVault();

      expect((await current()).body.data.vault).toMatchObject({ vaultId, status: 'ACTIVE' });
    });

    it('requires a device token', async () => {
      expect((await request(fixture.app).get('/api/vaults/current')).status).toBe(401);
    });
  });
});
