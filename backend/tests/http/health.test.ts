import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApiFixture } from '../support/apiFixture';





describe('GET /api/health', () => {
  it('reports that the API and database are running', async () => {
    const { app } = await createApiFixture();
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { status: 'ok', database: 'ok', paypal: 'ok', mode: 'sandbox' },
    });
  });

  it('reports 503 when the database is down', async () => {
    const { app } = await createApiFixture({ databaseIsUp: false });
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.data).toMatchObject({ status: 'degraded', database: 'down' });
  });

  it('reports 503 when PayPal is down', async () => {
    const { app, gateway } = await createApiFixture();
    gateway.unavailable = true;

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.data).toMatchObject({ status: 'degraded', database: 'ok', paypal: 'down' });
  });
});