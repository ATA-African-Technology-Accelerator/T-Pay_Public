// The only place that creates concrete adapters. Features import what they need from here.
import { AppLock } from '@tpay/shared/application/use-cases/appLock';
import { loadOnDeviceModel } from '../adapters/ai/onDeviceModel';
import { HttpTPayApi } from '../adapters/api/httpApi';
import { NetInfoConnectivity } from '../adapters/connectivity/netInfoConnectivity';
import { DeviceSigner } from '../adapters/crypto/deviceSigner';
import { SecureKeyStore } from '../adapters/crypto/secureKeyStore';
import { DeviceBiometrics } from '../adapters/device/biometrics';
import { ExpoSpeechInput, ExpoSpeechOutput } from '../adapters/speech/speech';
import { openKv } from '../adapters/storage/kv';
import { LocalStore } from '../adapters/storage/localStore';
import { SecurePinStore } from '../adapters/storage/securePinStore';
import { secureRandom, systemClock } from '../adapters/system/system';
import { loadNearbyDriver } from '../adapters/transport/nearbyDriver';
import { NearbyTransport } from '../adapters/transport/nearbyTransport';
import { loadRadio } from '../adapters/transport/radio';
import { config } from '../config';
import { sessionStore } from '../session/sessionStore';

export const signer = new DeviceSigner();
export const keyStore = new SecureKeyStore();
export const clock = systemClock;
export const random = secureRandom;
export const api = new HttpTPayApi(config.apiUrl, sessionStore.token);
export const biometrics = new DeviceBiometrics();
export const pinStore = new SecurePinStore();
export const appLock = new AppLock({ store: pinStore, biometrics, signer, random, clock });
export const store = new LocalStore(openKv());
export const connectivity = new NetInfoConnectivity();
export const nearby = new NearbyTransport(loadNearbyDriver(), loadRadio());
export const speechIn = new ExpoSpeechInput();
export const speechOut = new ExpoSpeechOutput();
/** The offline assistant model. Nothing is downloaded unless the person asks in Settings. */
export const localModel = loadOnDeviceModel();
