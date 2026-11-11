// The public pay page is the one place a stranger can type into our server. Odd amounts, odd tokens,
// odd bodies: it must answer plainly, never crash, never show an email, never charge twice.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisteredDevice } from '../support/apiFixture';
import { createApiFixture } from '../support/apiFixture';

describe('Pay page edge cases', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let owner: RegisteredDevice;
  let url: string;
  const path = () => new URL(url).pathname;
  const submit = (amount: string) => request(fixture.app).post(path()).type('form').send({ amount });

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    owner = await fixture.registerDevice('Mama Nkechi');
    url = (await request(fixture.app).get('/api/wallet/pay-link').set('Authorization', `Bearer ${owner.deviceToken}`)).body.data.url;
  });

  describe('amounts', () => {
    it.each(['1', '1.00', '10', '10.5', '10.50', '500', '500.00', '007.50', '1.0'])('takes %j', async (amount) => {
      const response = await submit(amount);
      expect([200, 302, 303]).toContain(response.status);
      expect(fixture.gateway.captureOrders.length).toBe(1);
    });

    it.each(['500.01', '0', '0.00', '0.99', '1,000', '+10', '１０', '1_000', '0x10', 'NaN', 'Infinity', '٥٠', '10;11', '10.00.00'])(
      'refuses %j without calling PayPal', async (amount) => {
        const response = await submit(amount);
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
        expect(fixture.gateway.captureOrders.length).toBe(0);
      },
    );

    it('trims spaces around an amount and reads it as that amount, never as another one', async () => {
      for (const typed of [' 10.00 ', '10\n', ' 10']) {
        fixture.gateway.captureOrders.length = 0;
        const response = await submit(typed);
        expect(response.status).toBeLessThan(400);
        expect(fixture.gateway.captureOrders[0]?.amountUsdMinor).toBe(1000);
      }
    });
  });

  describe('bodies', () => {
    it('answers a JSON body, an empty body and a wrong type without a server error', async () => {
      for (const send of [
        () => request(fixture.app).post(path()).send({ amount: '10.00' }),
        () => request(fixture.app).post(path()),
        () => request(fixture.app).post(path()).type('form').send('amount=10&amount=20'),
        () => request(fixture.app).post(path()).type('form').send({ amount: ['10', '20'] }),
        () => request(fixture.app).post(path()).type('text').send('amount=10'),
        () => request(fixture.app).post(path()).type('form').send({ amount: 'x'.repeat(100_000) }),
      ]) {
        const response = await send();
        expect(response.status).toBeLessThan(500);
      }
    });

    it('makes at most one order for a repeated amount field', async () => {
      await request(fixture.app).post(path()).type('form').send('amount=10&amount=20');
      expect(fixture.gateway.captureOrders.length).toBeLessThanOrEqual(1);
    });
  });

  describe('tokens', () => {
    it.each(['/pay/', '/pay/%00', '/pay/..%2f..%2fapi%2fwallet', `/pay/${'a'.repeat(5000)}`, '/pay/<script>', '/pay/%E0%A4%A', '/pay/ ', '/pay/a/b/c'])(
      '%s is a plain not found, never a server error', async (target) => {
        const response = await request(fixture.app).get(target);
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
        expect(response.text).not.toMatch(/stack|at .*\(.*:\d+:\d+\)/i);
      },
    );

    it('does not tell a real token from a wrong one by how it answers a bad amount', async () => {
      const real = await submit('0');
      const fake = await request(fixture.app).post('/pay/AAAAAAAAAAAAAAAAAAAAAA').type('form').send({ amount: '0' });
      expect(fake.status).toBe(404);
      expect(real.status).not.toBe(404);
    });

    it('treats the token case sensitively', async () => {
      const [, , token] = path().split('/');
      const swapped = `/pay/${(token as string).replace(/[a-zA-Z]/, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))}`;
      expect((await request(fixture.app).get(swapped)).status).toBe(404);
    });

    it('does not answer other methods on the page', async () => {
      for (const method of ['put', 'delete', 'patch'] as const) {
        const response = await request(fixture.app)[method](path());
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      }
    });
  });

  describe('names', () => {
    it.each([
      '"><img src=x onerror=alert(1)>',
      "Bola' OR '1'='1",
      '<b>Bold</b> & "quotes"',
      '{{7*7}} ${7*7}',
      '😀 Mama 🛒',
      'مرحبا Chidi',
      'A'.repeat(80),
    ])('shows the owner %j as plain text', async (name) => {
      const who = await fixture.registerDevice(name);
      const link = (await request(fixture.app).get('/api/wallet/pay-link').set('Authorization', `Bearer ${who.deviceToken}`)).body.data.url;
      const page = await request(fixture.app).get(new URL(link).pathname);

      expect(page.status).toBe(200);
      expect(page.text).not.toMatch(/<img src=x|<b>Bold|<script/i);
      expect(page.text).not.toContain('{{7*7}} 49');
    });
  });

  describe('returns', () => {
    it('credits nothing for a return that names a deposit that does not exist', async () => {
      const response = await request(fixture.app).get(`${path()}/return`).query({ depositId: 'dep_nope', outcome: 'approved', token: 'x' });
      expect(response.status).toBeLessThan(500);
      expect((await request(fixture.app).get('/api/wallet').set('Authorization', `Bearer ${owner.deviceToken}`)).body.data.balanceNgnMinor).toBe(0);
    });

    it.each([{}, { outcome: 'approved' }, { depositId: 'x' }, { depositId: 'x', outcome: 'maybe' }, { depositId: ['a', 'b'], outcome: 'approved' }])(
      'answers the incomplete return %j without a server error', async (query) => {
        const response = await request(fixture.app).get(`${path()}/return`).query(query as Record<string, string>);
        expect(response.status).toBeLessThan(500);
      },
    );
  });

  describe('limits', () => {
    it('limits by address even when the amounts are wrong, so a bot cannot probe forever', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 30; i += 1) statuses.push((await submit('abc')).status);
      expect(statuses).toContain(429);
    });

    it('does not let one address spend the limit of another', async () => {
      for (let i = 0; i < 30; i += 1) await request(fixture.app).post(path()).set('X-Forwarded-For', '203.0.113.9').type('form').send({ amount: '10' });
      const other = await request(fixture.app).post(path()).set('X-Forwarded-For', '203.0.113.77').type('form').send({ amount: '10' });
      expect(other.status).not.toBe(429);
    });
  });
});
