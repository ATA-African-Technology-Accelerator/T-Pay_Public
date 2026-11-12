// Contract section 6: UNAUTHENTICATED means register again and repeat once;
// DEVICE_REVOKED means stop signing and start setup again (ACT-02).
import { ApiRequestError } from '../adapters/api/httpApi';
import { api, keyStore, pinStore, signer, store } from '../composition';
import { config } from '../config';
import { profileStore } from './profileStore';
import { registerDevice } from './registerDevice';
import { sessionStore } from './sessionStore';

// Renew a few days early: a merchant offline for the weekend must still be trusted.
const RENEW_BEFORE_MS = 2 * 24 * 60 * 60 * 1000;

type RevokedListener = () => void;
const revokedListeners = new Set<RevokedListener>();

/** The app shows setup again when this fires. */
export function onRevoked(listener: RevokedListener): () => void {
  revokedListeners.add(listener);
  return () => { revokedListeners.delete(listener); };
}

export class DeviceRevoked extends Error {}

async function reregister() {
  const profile = await profileStore.load();
  if (!profile) throw new ApiRequestError('UNAUTHENTICATED', 'No saved details to register again with', 401);
  return registerDevice(profile, { api, signer, keyStore, rootPublicKey: config.rootPublicKey });
}

/** Forget this identity entirely. The key, session, PIN and local records all go. */
export async function forgetDevice() {
  const handle = await keyStore.loadPrivateKey().catch(() => null);
  await Promise.allSettled([
    handle ? signer.forget(handle) : Promise.resolve(),
    keyStore.deletePrivateKey(),
    sessionStore.clear(),
    profileStore.clear(),
    pinStore.clear(),
    store.wipe(),
  ]);
}

export async function withSession<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof ApiRequestError)) throw e;
    if (e.code === 'DEVICE_REVOKED') {
      await forgetDevice();
      revokedListeners.forEach(l => l());
      throw new DeviceRevoked();
    }
    if (e.code !== 'UNAUTHENTICATED') throw e;
    await reregister();
    return call();
  }
}

/** ACT-01: a fresh certificate before the old one expires, when there is network. */
export async function renewCertificateIfDue(now = new Date()): Promise<boolean> {
  const session = await sessionStore.load();
  if (!session) return false;
  const expires = new Date(session.deviceCertificate.payload.expiresAt).getTime();
  if (expires - now.getTime() > RENEW_BEFORE_MS) return false;
  await withSession(reregister);
  return true;
}
