import { getRandomBytes, randomUUID } from 'expo-crypto';
import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import { bytesToBase64Url } from '../crypto/encoding';

const NONCE_BYTES = 16;

export const systemClock: IClock = { now: () => new Date() };

export const secureRandom: IRandom = {
  uuid: () => randomUUID(),
  nonce: () => bytesToBase64Url(getRandomBytes(NONCE_BYTES)),
};
