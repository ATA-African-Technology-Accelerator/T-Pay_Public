import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiFixture } from '../support/apiFixture';




describe('API errors', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;

  beforeEach(async () => {
    fixture = await createApiFixture();
  });

  it('uses the contract format for an unknown route', async () => {
    const response = await request(fixture.app).get('/api/unknown');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('uses the contract format for malformed JSON', async () => {
    const response = await request(fixture.app)
      .post('/api/devices/register')
      .set('Content-Type', 'application/json')
      .send('{bad json');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});