import type { RegisterDeviceResponse } from '@tpay/shared/contracts/api';
import { secureValues } from '../adapters/storage/secureValues';

const SESSION = 'tpay.device.session';
const PUBLIC_KEY = 'tpay.device.publicKey';

export type DeviceSession = Pick<RegisterDeviceResponse, 'deviceId' | 'keyId' | 'deviceToken' | 'deviceCertificate'>;

export const sessionStore = {
  async load(): Promise<DeviceSession | null> {
    const raw = await secureValues.get(SESSION);
    return raw ? (JSON.parse(raw) as DeviceSession) : null;
  },
  save(session: DeviceSession): Promise<void> {
    return secureValues.set(SESSION, JSON.stringify(session));
  },
  async token(): Promise<string | null> {
    return (await sessionStore.load())?.deviceToken ?? null;
  },
  loadPublicKey: () => secureValues.get(PUBLIC_KEY),
  savePublicKey: (key: string) => secureValues.set(PUBLIC_KEY, key),
};
