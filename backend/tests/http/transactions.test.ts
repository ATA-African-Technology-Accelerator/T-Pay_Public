import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiFixture } from '../support/apiFixture';
import { transaction } from '../support/deviceFactory';

describe('GET /api/transactions', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  const list = (token: string, query = '') =>
    request(fixture.app).get(`/api/transactions${query}`).set('Authorization', `Bearer ${token}`);

  beforeEach(async () => {
    fixture = await createApiFixture();
  });

  it('requires a device token', async () => {
    const response = await request(fixture.app).get('/api/transactions');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the contract shape', async () => {
    const device = await fixture.registerDevice();
    await fixture.transactions.append(transaction('txn_1', device.deviceId));

    const response = await list(device.deviceToken);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      items: [
        {
          transactionId: 'txn_1',
          type: 'VOUCHER_SETTLED',
          amountNgnMinor: 200000,
          amountUsdMinor: 133,
          vaultId: 'vlt_1',
          voucherId: 'vch_1',
          paypalReferenceId: 'SANDBOX-CAPTURE',
          occurredAt: '2026-11-06T10:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('never shows the history of another device', async () => {
    const mine = await fixture.registerDevice();
    const other = await fixture.registerDevice();
    await fixture.transactions.append(transaction('txn_other', other.deviceId));

    const response = await list(mine.deviceToken);

    expect(response.body.data.items).toEqual([]);
  });

  it('returns 50 items a page and a cursor for the rest', async () => {
    const device = await fixture.registerDevice();
    for (let index = 0; index < 51; index += 1) {
      await fixture.transactions.append(transaction(`txn_${index}`, device.deviceId));
    }

    const first = await list(device.deviceToken);
    const second = await list(device.deviceToken, `?since=${first.body.data.nextCursor}`);

    expect(first.body.data.items).toHaveLength(50);
    expect(second.body.data.items).toHaveLength(1);
    expect(second.body.data.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor', async () => {
    const device = await fixture.registerDevice();

    const response = await list(device.deviceToken, '?since=abc');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});