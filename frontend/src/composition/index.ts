// The only place that creates concrete adapters. Screens get what they need from here.
import { HttpTPayApi } from '../adapters/api/httpApi';
import { DeviceSigner } from '../adapters/crypto/deviceSigner';
import { SecureKeyStore } from '../adapters/crypto/secureKeyStore';
import { DeviceBiometrics } from '../adapters/device/biometrics';
import { SecurePinStore } from '../adapters/storage/securePinStore';
import { secureRandom, systemClock } from '../adapters/system/system';
import { AppLock } from '@tpay/shared/application/use-cases/appLock';
import { config } from '../config';
import { sessionStore } from '../session/sessionStore';

export const signer = new DeviceSigner();
export const keyStore = new SecureKeyStore();
export const api = new HttpTPayApi(config.apiUrl, sessionStore.token);
export const biometrics = new DeviceBiometrics();
export const appLock = new AppLock({ store: new SecurePinStore(), biometrics, signer, random: secureRandom, clock: systemClock });
