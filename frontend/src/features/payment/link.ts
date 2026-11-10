// One Bluetooth link at a time, kept outside the screens so it survives moving from
// the request to the scanner and back. Bluetooth only ever saves scans: every wait
// here ends in a channel or in null, and null means use the QR (contract 5.4).
import type { IProximityChannel } from '@tpay/shared/application/ports/device';
import { nearby } from '../../composition';

/** How long the customer's phone waits after Pay before showing the voucher QR. */
export const JOIN_DEADLINE_MS = 8_000;
/** How long to wait for the other phone's reply on an open channel. */
export const REPLY_DEADLINE_MS = 12_000;

let controller: AbortController | null = null;
let opening: Promise<IProximityChannel | null> | null = null;
let open: IProximityChannel | null = null;

/** Ask only for what is missing, and never block: false means QR only. */
export async function bluetoothReady(): Promise<boolean> {
  const state = await nearby.readiness();
  if (state === 'READY') return true;
  if (state === 'UNSUPPORTED') return false;
  return (await nearby.requestReady()) === 'READY';
}

function start(connect: (signal: AbortSignal) => Promise<IProximityChannel>) {
  closeLink();
  const c = new AbortController();
  controller = c;
  opening = connect(c.signal).then(
    channel => { if (c.signal.aborted) { void channel.close(); return null; } open = channel; return channel; },
    () => null,
  );
}

/** Merchant, ACT-06: wait for the customer who scanned this session code. */
export function hostLink(sessionCode: string) {
  start(signal => nearby.host(sessionCode, signal));
}

/** Customer, ACT-07: join in the background while the person reviews the payment. */
export function joinLink(sessionCode: string) {
  start(signal => nearby.join(sessionCode, signal));
}

/** The open channel, waiting at most `deadlineMs` for it. Null means use the QR. */
export async function linkChannel(deadlineMs?: number): Promise<IProximityChannel | null> {
  if (open) return open;
  if (!opening) return null;
  if (deadlineMs === undefined) return opening;
  return Promise.race([opening, new Promise<null>(resolve => setTimeout(() => resolve(null), deadlineMs))]);
}

/** Resolves with the next frame, or null if none arrives in time or the link drops. */
export async function receiveFrame(channel: IProximityChannel, deadlineMs = REPLY_DEADLINE_MS): Promise<string | null> {
  return Promise.race([
    channel.receive().catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), deadlineMs)),
  ]);
}

/** False when sending failed, so the caller shows the QR. */
export async function sendFrame(channel: IProximityChannel, frame: string): Promise<boolean> {
  try {
    await channel.send(frame);
    return true;
  } catch {
    return false;
  }
}

/** Ends the activity's link: stop hosting or joining and close any channel. */
export function closeLink() {
  controller?.abort();
  controller = null;
  opening = null;
  const channel = open;
  open = null;
  void channel?.close().catch(() => undefined);
}

export const hasLink = () => controller !== null;
