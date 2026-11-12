import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// SecureStore encrypts with a Keystore-held key on Android. The web preview has no
// secure storage, so it uses localStorage; the web build is for demos only.
const web = Platform.OS === 'web';

export const secureValues = {
  async get(key: string): Promise<string | null> {
    if (web) return safe(() => localStorage.getItem(key)) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (web) { safe(() => localStorage.setItem(key, value)); return; }
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async remove(key: string): Promise<void> {
    if (web) { safe(() => localStorage.removeItem(key)); return; }
    await SecureStore.deleteItemAsync(key);
  },
};

function safe<T>(read: () => T): T | undefined {
  try { return read(); } catch { return undefined; }
}
