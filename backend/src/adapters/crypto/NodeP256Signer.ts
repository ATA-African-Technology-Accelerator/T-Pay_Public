import {
  createECDH, createHash, createPrivateKey,
  createPublicKey, randomBytes, sign, verify,
} from 'node:crypto';
import type { ISigner, KeyPair } from '@tpay/shared/application/ports/crypto';






const CURVE = 'prime256v1';
const PRIVATE_KEY_BYTES = 32;
const COORDINATE_BYTES = 32;
const UNCOMPRESSED_PREFIX_BYTES = 1;
const CURVE_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;


export class NodeP256Signer implements ISigner {
  public async generateKeyPair(): Promise<KeyPair> {
    const privateKey = randomBytes(PRIVATE_KEY_BYTES);
    return {
      privateKey: privateKey.toString('base64url'),
      publicKey: this.derivePublicKey(privateKey).toString('base64url'),
    };
  }


  public async sign(signingInput: string, privateKey: string): Promise<string> {
    const secret = Buffer.from(privateKey, 'base64url');
    const key = createPrivateKey({
      format: 'jwk',
      key: { ...this.toPublicJwk(this.derivePublicKey(secret)), d: privateKey },
    });
    const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
    return this.toLowS(signature).toString('base64url');
  }


  public async verify(signingInput: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      const key = createPublicKey({
        format: 'jwk',
        key: this.toPublicJwk(Buffer.from(publicKey, 'base64url')),
      });
      return verify(
        'sha256',
        Buffer.from(signingInput),
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      );
    } catch {
      return false;
    }
  }


  public async hash(value: string): Promise<string> {
    return createHash('sha256').update(value).digest('base64url');
  }


  private toLowS(signature: Buffer): Buffer {
    const r = signature.subarray(0, COORDINATE_BYTES);
    const s = BigInt(`0x${signature.subarray(COORDINATE_BYTES).toString('hex')}`);
    if (s <= CURVE_ORDER / 2n) {
      return signature;
    }
    const lowS = (CURVE_ORDER - s).toString(16).padStart(COORDINATE_BYTES * 2, '0');
    return Buffer.concat([r, Buffer.from(lowS, 'hex')]);
  }


  private derivePublicKey(privateKey: Buffer): Buffer {
    const ecdh = createECDH(CURVE);
    ecdh.setPrivateKey(privateKey);
    return ecdh.getPublicKey();
  }

  
  private toPublicJwk(publicKey: Buffer) {
    const xEnd = UNCOMPRESSED_PREFIX_BYTES + COORDINATE_BYTES;
    return {
      kty: 'EC',
      crv: 'P-256',
      x: publicKey.subarray(UNCOMPRESSED_PREFIX_BYTES, xEnd).toString('base64url'),
      y: publicKey.subarray(xEnd).toString('base64url'),
    };
  }
}