import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiFixture, NOW } from '../support/apiFixture';




describe('profile', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;

  beforeEach(async () => {
    fixture = await createApiFixture();
  });

  it('requires a device token', async () => {
    const response = await request(fixture.app).get('/api/profile');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an unknown device token', async () => {
    const response = await request(fixture.app)
      .get('/api/profile')
      .set('Authorization', 'Bearer not-a-token');

    expect(response.status).toBe(401);
  });

  it('returns the profile of the calling device', async () => {
    const device = await fixture.registerDevice();
    const response = await request(fixture.app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${device.deviceToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      deviceId: device.deviceId,
      displayName: 'Mama Nkechi Provisions',
      language: 'pcm',
      payoutEmail: 'merchant-sandbox@example.com',
      autoCashOut: true,
      assuranceTier: 'B',
      createdAt: NOW.toISOString(),
    });
  });

  it('updates allowed profile fields', async () => {
    const device = await fixture.registerDevice();
    const response = await request(fixture.app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${device.deviceToken}`)
      .send({ displayName: 'Mama Nkechi Stores', language: 'yo' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ displayName: 'Mama Nkechi Stores', language: 'yo' });
  });

  it('rejects fields that are not part of the profile', async () => {
    const device = await fixture.registerDevice();
    const response = await request(fixture.app)
      .patch('/api/profile')
      .set('Authorization', `Bearer ${device.deviceToken}`)
      .send({ role: 'CUSTOMER' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});