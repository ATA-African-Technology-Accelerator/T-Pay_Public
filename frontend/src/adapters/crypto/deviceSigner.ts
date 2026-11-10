import { Platform } from 'react-native';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { ISigner, KeyPair } from '@tpay/shared/application/ports/crypto';
import { TpayKeystore, type KeyLocation } from '../../../modules/tpay-keystore';
import { base64ToBytes, bytesToBase64Url, derToLowSCompact, spkiToRawPublicKey } from './encoding';

const KEY_ALIAS = 'tpay-device-key-v1';
// The shared port passes "private keys" as text. A hardware key can't leave the chip,
// so for it we pass a handle naming the Keystore entry instead.
const HARDWARE = 'keystore:';
const SOFTWARE = 'software:';

/** True when this build can't hold keys in hardware: web, Expo Go and iOS for now. */
export const softwareOnly = TpayKeystore == null;

/**
 * P-256 / SHA-256 signer matching the backend's NodeP256Signer byte for byte.
 * On Android the key is made and used inside the Keystore. Elsewhere it falls back to a
 * software key, which is allowed only on web and in development builds.
 */
export class DeviceSigner implements ISigner {
  private location: KeyLocation = 'software';

  public get keyLocation(): KeyLocation {
    return this.location;
  }

  public async generateKeyPair(): Promise<KeyPair> {
    if (TpayKeystore) {
      const key = await TpayKeystore.generateKey(KEY_ALIAS);
      this.location = key.location;
      return { publicKey: bytesToBase64Url(spkiToRawPublicKey(key.publicKey)), privateKey: HARDWARE + KEY_ALIAS };
    }
    assertSoftwareAllowed();
    const { secretKey } = p256.keygen();
    // Uncompressed (65 bytes): the backend rejects noble's default compressed form.
    const publicKey = p256.getPublicKey(secretKey, false);
    return { publicKey: bytesToBase64Url(publicKey), privateKey: SOFTWARE + bytesToBase64Url(secretKey) };
  }

  public async sign(signingInput: string, privateKey: string): Promise<string> {
    if (privateKey.startsWith(HARDWARE)) {
      if (!TpayKeystore) throw new Error('This build cannot reach the Keystore');
      const der = await TpayKeystore.sign(privateKey.slice(HARDWARE.length), signingInput);
      return bytesToBase64Url(derToLowSCompact(der));
    }
    if (privateKey.startsWith(SOFTWARE)) {
      assertSoftwareAllowed();
      const secret = base64ToBytes(privateKey.slice(SOFTWARE.length));
      return bytesToBase64Url(p256.sign(utf8ToBytes(signingInput), secret, { lowS: true, prehash: true }));
    }
    throw new Error('Unknown key handle');
  }

  public async verify(signingInput: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      return p256.verify(base64ToBytes(signature), utf8ToBytes(signingInput), base64ToBytes(publicKey), { prehash: true, lowS: true });
    } catch {
      return false;
    }
  }

  public async hash(value: string): Promise<string> {
    return bytesToBase64Url(sha256(utf8ToBytes(value)));
  }

  /** Reads where an existing hardware key lives, after the app restarts. */
  public async refreshLocation(privateKey: string): Promise<KeyLocation> {
    if (privateKey.startsWith(HARDWARE) && TpayKeystore) {
      this.location = (await TpayKeystore.describeKey(privateKey.slice(HARDWARE.length))).location;
    }
    return this.location;
  }

  public async forget(privateKey: string): Promise<void> {
    if (privateKey.startsWith(HARDWARE) && TpayKeystore) await TpayKeystore.deleteKey(privateKey.slice(HARDWARE.length));
  }
}

function assertSoftwareAllowed(): void {
  if (Platform.OS !== 'web' && !__DEV__) {
    throw new Error('Release builds must keep the device key in the Android Keystore');
  }
}
