import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiFixture, type RegisteredDevice } from '../support/apiFixture';




const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;


describe('request IDs and access logs', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  let device: RegisteredDevice;
  let lines: string[];

  const entries = (event: string) =>
    lines.map((line) => JSON.parse(line)).filter((entry) => entry.event === event);
  const waitForLogs = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(async () => {
    lines = [];
    vi.spyOn(console, 'info').mockImplementation((line: string) => {
      lines.push(line);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await createApiFixture();
    device = await fixture.registerDevice('Ada');
    lines = [];
  });


  it('gives every response a request ID', async () => {
    const response = await request(fixture.app).get('/api/health');

    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('keeps a well-formed ID sent by the caller', async () => {
    const response = await request(fixture.app).get('/api/health').set('X-Request-Id', 'sync-attempt-42');

    expect(response.headers['x-request-id']).toBe('sync-attempt-42');
  });

  it.each([
    ['too short', 'abc'],
    ['spaces and symbols', 'not a valid id!'],
    ['too long', 'x'.repeat(65)],
  ])('replaces an ID that is %s', async (_label, offered) => {
    const response = await request(fixture.app).get('/api/health').set('X-Request-Id', offered);

    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('logs one line per request with its outcome and device', async () => {
    const response = await request(fixture.app)
      .get('/api/transactions?since=0')
      .set('Authorization', `Bearer ${device.deviceToken}`);
    await waitForLogs();

    expect(entries('http.request')).toEqual([{
      event: 'http.request',
      requestId: response.headers['x-request-id'],
      method: 'GET',
      path: '/api/transactions',
      status: 200,
      durationMs: expect.any(Number),
      deviceId: device.deviceId,
    }]);
  });

  it('logs refused and unknown requests too', async () => {
    await request(fixture.app).get('/api/vaults/current');
    await request(fixture.app).get('/api/nowhere');
    await waitForLogs();

    expect(entries('http.request').map(({ path, status, deviceId }) => ({ path, status, deviceId }))).toEqual([
      { path: '/api/vaults/current', status: 401, deviceId: null },
      { path: '/api/nowhere', status: 404, deviceId: null },
    ]);
  });

  it('never logs the device token, query strings or bodies', async () => {
    await request(fixture.app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${device.deviceToken}`)
      .set('Idempotency-Key', 'key-for-profile-1')
      .send({ displayName: 'Secret Name' });
    await request(fixture.app)
      .get('/api/transactions?since=12345')
      .set('Authorization', `Bearer ${device.deviceToken}`);
    await waitForLogs();

    const all = lines.join('\n');
    expect(all).not.toContain(device.deviceToken);
    expect(all).not.toContain('Secret Name');
    expect(all).not.toContain('12345');
  });

  it('tags the assistant log with the same request ID', async () => {
    const response = await request(fixture.app)
      .post('/api/assistant/interpret')
      .set('Authorization', `Bearer ${device.deviceToken}`)
      .send({
        text: 'Abeg collect one thousand',
        audioBase64: null,
        audioMimeType: null,
        language: 'pcm',
        context: { remainingNgnMinor: 800_000 },
      });
    await waitForLogs();

    const requestId = response.headers['x-request-id'];
    expect(entries('assistant.interpret')[0]?.requestId).toBe(requestId);
    expect(entries('http.request')[0]?.requestId).toBe(requestId);
  });
});
