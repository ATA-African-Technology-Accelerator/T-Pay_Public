// Bluetooth for ACT-06 to ACT-09, through Google Nearby Connections.
//
// Bluetooth is an upgrade over QR, never a requirement. Every failure here rejects
// or reports a readiness other than READY, and the payment hooks fall back to QR.
// The frames sent are the same text QR carries, so nothing here is trusted: the
// payment rules in shared/ verify every frame that arrives.
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type {
  INearbyTransport, IProximityChannel, NearbyReadiness,
} from '@tpay/shared/application/ports/device';
import { MAX_FRAME_LENGTH } from '@tpay/shared/contracts/frames';
import { isSessionCode } from '@tpay/shared/domain/frames';
import { bytesToBase64Url } from '../crypto/encoding';
import type { NearbyDriver, Unsubscribe } from './nearbyDriver';
import type { Radio } from './radio';

const TAG_PREFIX = 'TPAY-NEARBY-V1';
const TAG_LENGTH = 16;
// Location services became optional for Nearby in Android 12.
const LOCATION_FREE_SDK = 31;
const RETRY_CONNECTION_MS = 1000;

export class NearbyClosed extends Error {
  constructor(message = 'The Bluetooth connection closed') {
    super(message);
    this.name = 'NearbyClosed';
  }
}

/**
 * The merchant advertises one tag and accepts only the phone that knows a second tag.
 * Both come from the session code, which only travels inside the QR the customer
 * scanned. A phone that overhears the broadcast can see the first tag, but can't make
 * the second, so it can't take the customer's place.
 */
export function sessionTags(sessionCode: string): { advertise: string; join: string } {
  const tag = (role: string) =>
    bytesToBase64Url(sha256(utf8ToBytes(`${TAG_PREFIX}\n${role}\n${sessionCode}`))).slice(0, TAG_LENGTH);
  return { advertise: tag('ADVERTISE'), join: tag('JOIN') };
}

export class NearbyTransport implements INearbyTransport {
  constructor(
    private readonly driver: NearbyDriver | null,
    private readonly radio: Radio | null,
  ) {}

  async readiness(): Promise<NearbyReadiness> {
    const { driver, radio } = this;
    if (!driver || !radio) return 'UNSUPPORTED';
    try {
      if (!(await driver.isPlayServicesAvailable())) return 'UNSUPPORTED';
      if (!(await radio.hasPermissions())) return 'NEEDS_PERMISSION';
      const bluetooth = await radio.bluetoothState();
      if (bluetooth === 'unsupported') return 'UNSUPPORTED';
      if (bluetooth === 'off') return 'BLUETOOTH_OFF';
      // The contract has no separate state for this. Nearby can't run without it on
      // older phones, and we never send someone to Settings mid-payment, so the
      // phone uses QR, exactly as when Bluetooth is off.
      if (radio.sdk < LOCATION_FREE_SDK && !(await radio.locationServicesOn())) return 'BLUETOOTH_OFF';
      return 'READY';
    } catch {
      return 'UNSUPPORTED';
    }
  }

  async requestReady(): Promise<NearbyReadiness> {
    const { radio } = this;
    let state = await this.readiness();
    if (!radio || state === 'READY' || state === 'UNSUPPORTED') return state;
    try {
      if (state === 'NEEDS_PERMISSION') {
        if (!(await radio.requestPermissions())) return 'NEEDS_PERMISSION';
        state = await this.readiness();
      }
      if (state === 'BLUETOOTH_OFF' && (await radio.bluetoothState()) === 'off') {
        await radio.requestBluetoothOn();
        state = await this.readiness();
      }
      return state;
    } catch {
      return this.readiness();
    }
  }

  // async, so a phone without Nearby or a bad code gives a rejected promise, never a throw.
  async host(sessionCode: string, signal: AbortSignal): Promise<IProximityChannel> {
    const driver = this.require();
    const tags = sessionTags(assertCode(sessionCode));
    return session<IProximityChannel>(signal, (resolve, reject, cleanup) => {
      let chosen: string | null = null;
      cleanup.add(() => { void driver.stopAdvertise(); });
      cleanup.add(driver.onInvitationReceived(({ peerId, name }) => {
        if (name !== tags.join) {
          void driver.rejectConnection(peerId).catch(() => undefined);
          return;
        }
        // A newer invitation with the right tag means the customer's last try failed
        // before connecting, so it replaces that one.
        chosen = peerId;
        driver.acceptConnection(peerId).catch(() => { if (chosen === peerId) chosen = null; });
      }));
      cleanup.add(driver.onConnected(({ peerId }) => {
        if (peerId !== chosen) {
          void driver.disconnect(peerId).catch(() => undefined);
          return;
        }
        resolve(openChannel(driver, peerId));
      }));
      driver.startAdvertise(tags.advertise).catch(reject);
    });
  }

  async join(sessionCode: string, signal: AbortSignal): Promise<IProximityChannel> {
    const driver = this.require();
    const tags = sessionTags(assertCode(sessionCode));
    return session<IProximityChannel>(signal, (resolve, reject, cleanup) => {
      let merchant: string | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const connect = (peerId: string) => {
        driver.requestConnection(peerId).catch(() => {
          // The merchant's radio can be busy for a moment. Keep trying until the
          // caller's own deadline aborts.
          if (merchant === peerId) timer = setTimeout(() => connect(peerId), RETRY_CONNECTION_MS);
        });
      };
      cleanup.add(() => { if (timer) clearTimeout(timer); void driver.stopDiscovery(); });
      cleanup.add(driver.onPeerFound(({ peerId, name }) => {
        if (name !== tags.advertise || merchant) return;
        merchant = peerId;
        connect(peerId);
      }));
      cleanup.add(driver.onPeerLost(({ peerId }) => {
        if (peerId === merchant) merchant = null;
      }));
      cleanup.add(driver.onConnected(({ peerId }) => {
        if (peerId === merchant) resolve(openChannel(driver, peerId));
      }));
      // Discovery advertises nothing; this name is what the merchant sees when we connect.
      driver.startDiscovery(tags.join).catch(reject);
    });
  }

  private require(): NearbyDriver {
    if (!this.driver) throw new NearbyClosed('Nearby is not available on this phone');
    return this.driver;
  }
}

function assertCode(sessionCode: string): string {
  if (!isSessionCode(sessionCode)) throw new NearbyClosed('Not a session code');
  return sessionCode;
}

type Cleanup = { add(fn: Unsubscribe): void };

/** Runs one host or join attempt and undoes all of it once it settles or is aborted. */
function session<T>(
  signal: AbortSignal,
  start: (resolve: (value: T) => void, reject: (error: unknown) => void, cleanup: Cleanup) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const undo: Unsubscribe[] = [];
    let settled = false;
    const finish = () => {
      settled = true;
      signal.removeEventListener('abort', onAbort);
      undo.splice(0).forEach(fn => { try { fn(); } catch { /* already gone */ } });
    };
    const onAbort = () => {
      if (settled) return;
      finish();
      reject(new NearbyClosed('Stopped waiting for the other phone'));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort);
    start(
      value => { if (!settled) { finish(); resolve(value); } },
      error => { if (!settled) { finish(); reject(error); } },
      { add: fn => (settled ? fn() : undo.push(fn)) },
    );
  });
}

/** One open connection. Frames arrive in order and wait in a queue until read. */
function openChannel(driver: NearbyDriver, peerId: string): IProximityChannel {
  const inbox: string[] = [];
  const readers: { resolve(text: string): void; reject(error: Error): void }[] = [];
  let closed: NearbyClosed | null = null;

  const shut = (reason: NearbyClosed) => {
    if (closed) return;
    closed = reason;
    stopText();
    stopDisconnect();
    readers.splice(0).forEach(r => r.reject(reason));
  };
  const stopText = driver.onTextReceived(({ peerId: from, text }) => {
    // Anything this long can't be a frame. decodeFrame would refuse it anyway.
    if (from !== peerId || text.length > MAX_FRAME_LENGTH) return;
    const reader = readers.shift();
    if (reader) reader.resolve(text); else inbox.push(text);
  });
  const stopDisconnect = driver.onDisconnected(({ peerId: from }) => {
    if (from === peerId) shut(new NearbyClosed());
  });

  return {
    async send(frame) {
      if (closed) throw closed;
      try {
        await driver.sendText(peerId, frame);
      } catch {
        throw new NearbyClosed('Could not send over Bluetooth');
      }
    },
    receive() {
      const next = inbox.shift();
      if (next !== undefined) return Promise.resolve(next);
      if (closed) return Promise.reject(closed);
      return new Promise<string>((resolve, reject) => readers.push({ resolve, reject }));
    },
    async close() {
      if (closed) return;
      shut(new NearbyClosed('Closed'));
      await driver.disconnect(peerId).catch(() => undefined);
    },
  };
}
