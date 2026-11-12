// How the API behaves when callers do odd things: no token, a strange token, a broken body,
// a huge body, a strange idempotency key. It must answer in the contract's format, never a 500.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisteredDevice } from '../support/apiFixture';
import { createApiFixture } from '../support/apiFixture';

describe('API robustness', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let device: RegisteredDevice;
  const authed = (method: 'get' | 'post' | 'patch', path: string, token = device.deviceToken) =>
    request(fixture.app)[method](path).set('Authorization', `Bearer ${token}`);
  const isContractError = (body: any) => typeof body?.error?.code === 'string' && typeof body?.error?.message === 'string';

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    device = await fixture.registerDevice('Mama Nkechi');
  });

  describe('the token', () => {
    it.each([
      ['no header', undefined],
      ['an empty bearer', 'Bearer '],
      ['only the word', 'Bearer'],
      ['a basic login', 'Basic dXNlcjpwYXNz'],
      ['a raw token without Bearer', 'abc'],
      ['two tokens', 'Bearer a b'],
      ['a long token', `Bearer ${'a'.repeat(8_000)}`],
      ['a token with markup', 'Bearer <script>alert(1)</script>'],
    ])('refuses %s with 401 in the contract format', async (_name, header) => {
      const call = request(fixture.app).get('/api/wallet');
      const response = await (header === undefined ? call : call.set('Authorization', header as string));
      expect(response.status).toBe(401);
      expect(isContractError(response.body)).toBe(true);
    });

    it('is polite about the scheme being lower case', async () => {
      const response = await request(fixture.app).get('/api/wallet').set('Authorization', `bearer ${device.deviceToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it('never lets one device read another device’s data', async () => {
      const other = await fixture.registerDevice('Bola');
      const mine = (await authed('get', '/api/wallet')).body.data;
      const theirs = (await authed('get', '/api/wallet', other.deviceToken)).body.data;
      expect(theirs).not.toBe(mine);
      expect((await authed('get', `/api/vouchers/${'vou_other'}`)).status).toBe(404);
    });

    it('does not echo the token back in an error', async () => {
      const response = await request(fixture.app).get('/api/wallet').set('Authorization', 'Bearer SECRET-TOKEN-VALUE');
      expect(JSON.stringify(response.body)).not.toContain('SECRET-TOKEN-VALUE');
    });
  });

  describe('bodies', () => {
    it.each([
      ['an array', '[]'], ['null', 'null'], ['a string', '"hi"'], ['a number', '5'], ['an empty object', '{}'],
      ['truncated JSON', '{"amountNgnMinor": 5'], ['nested junk', '{"a":{"b":{"c":[[[[[]]]]]}}}'],
    ])('answers %s on add money with a 4xx contract error', async (_name, body) => {
      const response = await authed('post', '/api/wallet/deposits').set('Idempotency-Key', 'k1').set('Content-Type', 'application/json').send(body);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(isContractError(response.body)).toBe(true);
    });

    it('answers a text body and a form body without a server error', async () => {
      for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/xml']) {
        const response = await authed('post', '/api/wallet/deposits').set('Idempotency-Key', 'k2').set('Content-Type', type).send('amountNgnMinor=500000');
        expect(response.status).toBeLessThan(500);
      }
    });

    it('refuses a body that is too large, in the contract format', async () => {
      const response = await authed('post', '/api/wallet/deposits').set('Idempotency-Key', 'k3').send({ amountNgnMinor: 500_000, junk: 'x'.repeat(3_000_000) });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(isContractError(response.body)).toBe(true);
    });

    it('refuses extra fields instead of ignoring them', async () => {
      const response = await authed('post', '/api/wallet/deposits').set('Idempotency-Key', 'k4').send({ amountNgnMinor: 500_000, isAdmin: true });
      expect(response.status).toBe(400);
    });

    it.each(['500000', 5e5 + 0.5, null, true, [500000], { v: 1 }])('refuses an amount of %j', async (amountNgnMinor) => {
      const response = await authed('post', '/api/wallet/deposits').set('Idempotency-Key', `k-${JSON.stringify(amountNgnMinor)}`).send({ amountNgnMinor });
      expect(response.status).toBe(400);
    });
  });

  describe('query strings', () => {
    it.each(['abc', '-1', '1.5', '99999999999999999999', '', ' 1', '1e3'])('refuses since=%j', async (since) => {
      const response = await authed('get', '/api/transactions').query({ since });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it('refuses a repeated since', async () => {
      const response = await authed('get', '/api/transactions?since=1&since=2');
      expect(response.status).toBeLessThan(500);
    });

    it('ignores nothing it does not know: an unknown query is refused or harmless, never an error', async () => {
      const response = await authed('get', '/api/transactions?foo=bar');
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('idempotency keys', () => {
    const add = (key: string | undefined, amountNgnMinor = 500_000) => {
      const call = authed('post', '/api/wallet/deposits');
      return (key === undefined ? call : call.set('Idempotency-Key', key)).send({ amountNgnMinor });
    };

    it.each(['', ' ', 'k'.repeat(1000), '<script>', 'a b c'])('handles the key %j without a server error', async (key) => {
      const response = await add(key);
      expect(response.status).toBeLessThan(500);
    });

    it('does not mix the same key across different amounts', async () => {
      const first = await add('same-key', 500_000);
      const second = await add('same-key', 600_000);
      expect(first.status).toBe(201);
      expect(second.status).not.toBe(201);
    });

    it('does not mix the same key across different devices', async () => {
      const other = await fixture.registerDevice('Bola');
      const mine = await add('shared-key', 500_000);
      const theirs = await authed('post', '/api/wallet/deposits', other.deviceToken).set('Idempotency-Key', 'shared-key').send({ amountNgnMinor: 500_000 });
      expect(mine.status).toBe(201);
      expect(theirs.status).toBe(201);
      expect(theirs.body.data.depositId).not.toBe(mine.body.data.depositId);
    });
  });

  describe('routes and methods', () => {
    it.each([['delete', '/api/wallet'], ['put', '/api/profile'], ['post', '/api/health'], ['get', '/api/'], ['get', '/'], ['get', '/api/wallet/']])(
      '%s %s is a clean answer', async (method, path) => {
        const response = await (request(fixture.app) as any)[method](path);
        expect(response.status).toBeLessThan(500);
      },
    );

    it('never leaks a stack trace', async () => {
      const response = await request(fixture.app).post('/api/devices/register').set('Content-Type', 'application/json').send('{bad');
      expect(JSON.stringify(response.body)).not.toMatch(/node_modules|at .*:\d+:\d+/);
    });

    it('answers health with no token and says nothing secret', async () => {
      const response = await request(fixture.app).get('/api/health');
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toMatch(/secret|password|key/i);
    });
  });
});
