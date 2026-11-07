import { randomBytes, randomUUID } from 'node:crypto';
import type { IRandom } from '@tpay/shared/application/ports/system';



const NONCE_BYTES = 32;

export class NodeRandom implements IRandom {
  public uuid(): string {
    return randomUUID();
  }

  public nonce(): string {
    return randomBytes(NONCE_BYTES).toString('base64url');
  }
}