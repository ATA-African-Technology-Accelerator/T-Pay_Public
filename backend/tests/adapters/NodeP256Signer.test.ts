import { p256 } from '@noble/curves/nist.js';
import { describe, expect, it } from 'vitest';
import { NodeP256Signer } from '../../src/adapters/crypto/NodeP256Signer';




const signer = new NodeP256Signer();


describe('NodeP256Signer', () => {
  it('signs and verifies a message', async () => {
    const keys = await signer.generateKeyPair();
    const signature = await signer.sign('hello', keys.privateKey);

    expect(await signer.verify('hello', signature, keys.publicKey)).toBe(true);
  });

  it('produces a raw 64-byte signature', async () => {
    const keys = await signer.generateKeyPair();
    const signature = await signer.sign('hello', keys.privateKey);

    expect(Buffer.from(signature, 'base64url')).toHaveLength(64);
  });

  it('rejects a changed message', async () => {
    const keys = await signer.generateKeyPair();
    const signature = await signer.sign('hello', keys.privateKey);

    expect(await signer.verify('hello!', signature, keys.publicKey)).toBe(false);
  });

  it('rejects the wrong public key', async () => {
    const keys = await signer.generateKeyPair();
    const other = await signer.generateKeyPair();
    const signature = await signer.sign('hello', keys.privateKey);

    expect(await signer.verify('hello', signature, other.publicKey)).toBe(false);
  });

  it('rejects malformed input instead of throwing', async () => {
    const keys = await signer.generateKeyPair();

    expect(await signer.verify('hello', 'not-a-signature', keys.publicKey)).toBe(false);
  });

  it('verifies a signature created by the library the phone uses', async () => {
    const secretKey = p256.utils.randomSecretKey();
    const publicKey = Buffer.from(p256.getPublicKey(secretKey, false)).toString('base64url');
    const message = new TextEncoder().encode('from the phone');
    const signature = Buffer.from(p256.sign(message, secretKey)).toString('base64url');

    expect(await signer.verify('from the phone', signature, publicKey)).toBe(true);
  });

  it('always creates signatures the phone library can verify', async () => {
    const keys = await signer.generateKeyPair();
    const publicKey = Buffer.from(keys.publicKey, 'base64url');
    const message = new TextEncoder().encode('from the server');

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const signature = await signer.sign('from the server', keys.privateKey);

      expect(p256.verify(Buffer.from(signature, 'base64url'), message, publicKey)).toBe(true);
    }
  });
});