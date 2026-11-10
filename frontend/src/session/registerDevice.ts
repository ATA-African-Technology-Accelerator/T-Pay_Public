import type { ISigner, IKeyStore } from '@tpay/shared/application/ports/crypto';
import type { ITPayApi } from '@tpay/shared/application/ports/api';
import type { RegistrationProofPayload } from '@tpay/shared/contracts/messages';
import { MESSAGE_PREFIX } from '@tpay/shared/contracts/messages';
import type { Language } from '@tpay/shared/contracts/statuses';
import { signingInput } from '@tpay/shared/domain/canonicalJson';
import { verifyDeviceCertificate } from '@tpay/shared/domain/certificates';
import { sessionStore, type DeviceSession } from './sessionStore';

export type RegistrationInput = { displayName: string; language: Language; payoutEmail: string };
type Deps = { api: ITPayApi; signer: ISigner; keyStore: IKeyStore; rootPublicKey: string; now?: () => Date };

export class CertificateRejected extends Error {}

/**
 * Registers this phone: makes (or reuses) the device key, signs the registration with it as
 * proof, sends it, checks the certificate the backend returns, and stores the session.
 */
export async function registerDevice(input: RegistrationInput, deps: Deps): Promise<DeviceSession> {
  const { api, signer, keyStore, rootPublicKey } = deps;
  const publicKey = await ensureKey(signer, keyStore);
  const handle = (await keyStore.loadPrivateKey())!;

  // Field set must match what the backend verifies: the request minus `proof`.
  const payload: RegistrationProofPayload = {
    publicKey,
    displayName: input.displayName.trim(),
    language: input.language,
    payoutEmail: input.payoutEmail.trim(),
  };
  const proof = await signer.sign(signingInput(MESSAGE_PREFIX.REGISTRATION, payload), handle);
  const response = await api.registerDevice({ ...payload, proof });

  if (rootPublicKey) {
    const check = await verifyDeviceCertificate(response.deviceCertificate, {
      rootPublicKey, signer, now: deps.now?.() ?? new Date(),
    });
    if (!check.isSuccess || response.deviceCertificate.payload.publicKey !== publicKey) {
      throw new CertificateRejected('The device certificate did not verify');
    }
  }

  const session: DeviceSession = {
    deviceId: response.deviceId,
    keyId: response.keyId,
    deviceToken: response.deviceToken,
    deviceCertificate: response.deviceCertificate,
  };
  await sessionStore.save(session);
  return session;
}

async function ensureKey(signer: ISigner, keyStore: IKeyStore): Promise<string> {
  const [handle, publicKey] = await Promise.all([keyStore.loadPrivateKey(), sessionStore.loadPublicKey()]);
  if (handle && publicKey) return publicKey;
  const pair = await signer.generateKeyPair();
  await keyStore.savePrivateKey(pair.privateKey);
  await sessionStore.savePublicKey(pair.publicKey);
  return pair.publicKey;
}
