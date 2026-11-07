// The only place that creates concrete adapters. Screens get what they need from here.
import { HttpTPayApi } from '../adapters/api/httpApi';
import { DeviceSigner } from '../adapters/crypto/deviceSigner';
import { SecureKeyStore } from '../adapters/crypto/secureKeyStore';
import { config } from '../config';
import { sessionStore } from '../session/sessionStore';

export const signer = new DeviceSigner();
export const keyStore = new SecureKeyStore();
export const api = new HttpTPayApi(config.apiUrl, sessionStore.token);
