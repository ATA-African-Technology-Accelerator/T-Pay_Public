import { requireOptionalNativeModule } from 'expo';

/** Where the private key lives. `strongbox` is a separate security chip; `tee` is the phone's secure area. */
export type KeyLocation = 'strongbox' | 'tee' | 'software';

export interface KeyDescription {
  /** X.509 SubjectPublicKeyInfo, standard base64. */
  publicKey: string;
  location: KeyLocation;
}

interface TpayKeystoreNative {
  hasKey(alias: string): Promise<boolean>;
  generateKey(alias: string): Promise<KeyDescription>;
  describeKey(alias: string): Promise<KeyDescription>;
  /** DER-encoded SHA-256 ECDSA signature over the UTF-8 message, standard base64. */
  sign(alias: string, message: string): Promise<string>;
  deleteKey(alias: string): Promise<void>;
}

/** Null in Expo Go, on web and on iOS, where this module isn't built. */
export const TpayKeystore = requireOptionalNativeModule<TpayKeystoreNative>('TpayKeystore');
