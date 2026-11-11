import type { Language } from '../../contracts/statuses';






export interface StoredPin {
  salt: string;
  hash: string;
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface IPinStore {
  load(): Promise<StoredPin | null>;
  save(pin: StoredPin): Promise<void>;
}

export interface IBiometricUnlock {
  isAvailable(): Promise<boolean>;
  authenticate(): Promise<boolean>;
}

export interface IProximityTransport {
  send(frame: string): Promise<void>;
  receive(): Promise<string>;
}


export type NearbyReadiness = 'READY' | 'NEEDS_PERMISSION' | 'BLUETOOTH_OFF' | 'UNSUPPORTED';


export interface IProximityChannel extends IProximityTransport {
  close(): Promise<void>;
}


// Bluetooth is an upgrade over QR, never a requirement: every caller falls back
// to QR when readiness is not READY, or when host or join rejects or is aborted.
export interface INearbyTransport {
  readiness(): Promise<NearbyReadiness>;
  // Shows only the system prompts that are still needed: the Nearby devices
  // permission, then the request to turn Bluetooth on. Never asks when READY.
  requestReady(): Promise<NearbyReadiness>;
  // Merchant: waits for the customer who scanned this session code.
  host(sessionCode: string, signal: AbortSignal): Promise<IProximityChannel>;
  // Customer: connects to the merchant advertising this session code.
  join(sessionCode: string, signal: AbortSignal): Promise<IProximityChannel>;
}


export interface IConnectivity {
  isOnline(): Promise<boolean>;
  onReconnect(listener: () => void): () => void;
}


export interface RecordedSpeech {
  audioBase64: string;
  audioMimeType: string;
}


export interface ISpeechInput {
  /** Records until the person stops talking, or taps stop. Throws NO_SPEECH when nothing was said. */
  record(): Promise<RecordedSpeech>;
  /** Listens for a short spoken answer: yes, no, or neither (null). */
  listenYesNo(language: Language): Promise<'yes' | 'no' | null>;
  transcribeOffline(language: Language): Promise<string | null>;
}


export interface ISpeechOutput {
  isAvailable(language: Language): Promise<boolean>;
  /** `natural` asks for the server's lifelike voice when online; everything else uses the phone's voice. */
  speak(text: string, language: Language, natural?: boolean): Promise<void>;
}