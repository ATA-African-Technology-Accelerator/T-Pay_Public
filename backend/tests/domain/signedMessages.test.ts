import { describe, expect, it } from 'vitest';
import { signMessage, verifyMessage } from '@tpay/shared/domain/signedMessages';
import { signer } from '../support/offlineFixture';



describe('signed messages', () => {
  it('verifies a signed message', async () => {
    const keys = await signer.generateKeyPair();
    const message = await signMessage('TEST-V1', { amount: 100 }, keys.privateKey, signer);

    expect(await verifyMessage('TEST-V1', message, keys.publicKey, signer)).toBe(true);
  });

  it('rejects a changed payload', async () => {
    const keys = await signer.generateKeyPair();
    const message = await signMessage('TEST-V1', { amount: 100 }, keys.privateKey, signer);
    const forged = { ...message, payload: { amount: 999 } };

    expect(await verifyMessage('TEST-V1', forged, keys.publicKey, signer)).toBe(false);
  });

  it('rejects a signature reused as another message type', async () => {
    const keys = await signer.generateKeyPair();
    const message = await signMessage('RECEIPT-V1', { amount: 100 }, keys.privateKey, signer);

    expect(await verifyMessage('VOUCHER-V1', message, keys.publicKey, signer)).toBe(false);
  });
});