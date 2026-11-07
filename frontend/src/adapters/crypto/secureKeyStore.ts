import type { IKeyStore } from '@tpay/shared/application/ports/crypto';
import { secureValues } from '../storage/secureValues';

const PRIVATE_KEY = 'tpay.device.privateKey';

/** Stores the key handle. For a Keystore key this is only its name; the key itself stays in the chip. */
export class SecureKeyStore implements IKeyStore {
  public loadPrivateKey(): Promise<string | null> {
    return secureValues.get(PRIVATE_KEY);
  }
  public savePrivateKey(privateKey: string): Promise<void> {
    return secureValues.set(PRIVATE_KEY, privateKey);
  }
  public deletePrivateKey(): Promise<void> {
    return secureValues.remove(PRIVATE_KEY);
  }
}
