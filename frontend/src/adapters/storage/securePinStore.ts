import type { IPinStore, StoredPin } from '@tpay/shared/application/ports/device';
import { secureValues } from './secureValues';

const PIN = 'tpay.appLock.pin';

/** Keeps only the salted PIN hash and the failure counter, encrypted by SecureStore. */
export class SecurePinStore implements IPinStore {
  public async load(): Promise<StoredPin | null> {
    const raw = await secureValues.get(PIN);
    return raw ? (JSON.parse(raw) as StoredPin) : null;
  }
  public save(pin: StoredPin): Promise<void> {
    return secureValues.set(PIN, JSON.stringify(pin));
  }
  public clear(): Promise<void> {
    return secureValues.remove(PIN);
  }
}
