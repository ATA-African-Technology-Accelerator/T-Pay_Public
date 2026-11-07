import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyDeviceCertificate } from '@tpay/shared/domain/certificates';
import { createApiFixture, NOW } from '../support/apiFixture';





describe('POST /api/devices/register', () => {
  let fixture: Awaited<ReturnType<typeof createApiFixture>>;
  const register = (body: object) =>
    request(fixture.app).post('/api/devices/register').send(body);

  beforeEach(async () => {
    fixture = await createApiFixture();
  });

  
  it('registers a device and issues a certificate the phone can verify', async () => {
    const response = await register(await fixture.registration());

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ assuranceTier: 'B' });

    const certificate = await verifyDeviceCertificate(
      response.body.data.deviceCertificate,
      { rootPublicKey: fixture.root.publicKey, now: NOW, signer: fixture.signer },
    );
    expect(certificate.isSuccess).toBe(true);
  });


  it('returns the same identity for a known key', async () => {
    const body = await fixture.registration();
    const first = await register(body);
    const second = await register(body);

    expect(second.status).toBe(200);
    expect(second.body.data.deviceId).toBe(first.body.data.deviceId);
    expect(second.body.data.keyId).toBe(first.body.data.keyId);
  });


  it('rejects a proof signed by a different key', async () => {
    const body = await fixture.registration();
    const other = await fixture.registration();
    const response = await register({ ...body, proof: other.proof });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INVALID_SIGNATURE');
  });


  it('requires a payout email', async () => {
    const response = await register({ ...(await fixture.registration()), payoutEmail: undefined });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });


  it('no longer accepts a role', async () => {
    const response = await register({ ...(await fixture.registration()), role: 'MERCHANT' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });


  it('rejects an unsupported language', async () => {
    const body = await fixture.registration();
    const response = await register({ ...body, language: 'fr' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});