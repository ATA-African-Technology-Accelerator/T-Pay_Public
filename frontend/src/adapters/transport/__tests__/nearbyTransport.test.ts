/// <reference types="jest" />
/// <reference types="node" />
// Two simulated phones (and a stranger) on a fake radio, through the real adapter.
import { NearbyTransport, NearbyClosed, sessionTags } from '../nearbyTransport';
import { encodeFrame, decodeFrame } from '@tpay/shared/domain/frames';

// Each check is named; the single test lists every one that failed.
const failures: string[] = [];
const check = (name: string, ok: boolean, extra = '') => { if (!ok) failures.push(extra ? `${name} (${extra})` : name); };
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));

// ---- A fake radio space shared by every phone -----------------------------------
type L = Record<string, Set<(e: any) => void>>;
class Air { phones = new Map<string, Phone>(); }
class Phone {
  ls: L = { found: new Set(), lost: new Set(), invite: new Set(), connected: new Set(), disconnected: new Set(), text: new Set() };
  advertising: string | null = null; discovering: string | null = null; links = new Set<string>(); pending = new Set<string>();
  calls: string[] = [];
  constructor(public id: string, public air: Air) { air.phones.set(id, this); }
  emit(k: string, e: any) { setTimeout(() => this.ls[k].forEach(f => f(e)), 1); }
  sub(k: string) { return (f: any) => { this.ls[k].add(f); return () => this.ls[k].delete(f); }; }
  listeners() { return Object.values(this.ls).reduce((a, s) => a + s.size, 0); }
  driver() {
    const me = this, air = this.air;
    return {
      isPlayServicesAvailable: async () => true,
      startAdvertise: async (name: string) => { me.calls.push('startAdvertise'); me.advertising = name; for (const p of air.phones.values()) if (p.discovering && p !== me) p.emit('found', { peerId: me.id, name }); return name; },
      stopAdvertise: async () => { me.calls.push('stopAdvertise'); me.advertising = null; },
      startDiscovery: async (name: string) => { me.calls.push('startDiscovery'); me.discovering = name; for (const p of air.phones.values()) if (p.advertising && p !== me) me.emit('found', { peerId: p.id, name: p.advertising }); return name; },
      stopDiscovery: async () => { me.calls.push('stopDiscovery'); me.discovering = null; },
      requestConnection: async (peerId: string) => { const p = air.phones.get(peerId)!; if (!p.advertising) throw new Error('gone'); p.pending.add(me.id); p.emit('invite', { peerId: me.id, name: me.discovering }); },
      acceptConnection: async (peerId: string) => { if (!me.pending.delete(peerId)) throw new Error('no invite'); const p = air.phones.get(peerId)!; me.links.add(peerId); p.links.add(me.id); me.emit('connected', { peerId, name: '' }); p.emit('connected', { peerId: me.id, name: '' }); },
      rejectConnection: async (peerId: string) => { me.calls.push('reject:' + peerId); me.pending.delete(peerId); },
      disconnect: async (peerId: string) => { if (!me.links.delete(peerId)) return; const p = air.phones.get(peerId)!; p.links.delete(me.id); p.emit('disconnected', { peerId: me.id }); },
      sendText: async (peerId: string, text: string) => { if (!me.links.has(peerId)) throw new Error('not connected'); air.phones.get(peerId)!.emit('text', { peerId: me.id, text }); },
      onPeerFound: me.sub('found'), onPeerLost: me.sub('lost'), onInvitationReceived: me.sub('invite'),
      onConnected: me.sub('connected'), onDisconnected: me.sub('disconnected'), onTextReceived: me.sub('text'),
    };
  }
}
function radio(o: Partial<{ sdk: number; perms: boolean; grant: boolean; bt: 'on' | 'off' | 'unsupported'; turnOn: boolean; location: boolean }> = {}) {
  const s = { sdk: 34, perms: true, grant: true, bt: 'on' as 'on' | 'off' | 'unsupported', turnOn: true, location: true, ...o };
  const prompts: string[] = [];
  return {
    prompts,
    r: {
      sdk: s.sdk,
      hasPermissions: async () => s.perms,
      requestPermissions: async () => { prompts.push('permissions'); s.perms = s.grant; return s.grant; },
      bluetoothState: async () => s.bt,
      requestBluetoothOn: async () => { prompts.push('bluetooth'); if (s.turnOn) s.bt = 'on'; return s.turnOn; },
      locationServicesOn: async () => s.location,
    },
  };
}
const CODE = 'Qm9vay1hLXNlYXQtYXQtdGhlLW1hcmtldC0x';  // 36 base64url chars
const timeout = (ms: number) => { const c = new AbortController(); (setTimeout(() => c.abort(), ms) as { unref?(): void }).unref?.(); return c.signal; };

test('Nearby transport: readiness, one payment, strangers, aborts and retries', async () => {
// ---- Readiness -----------------------------------------------------------------
{
  const air = new Air(); const d = new Phone('a', air).driver();
  check('no Nearby (Expo Go / web) is UNSUPPORTED', await new NearbyTransport(null, null).readiness() === 'UNSUPPORTED');
  check('no Play Services is UNSUPPORTED', await new NearbyTransport({ ...d, isPlayServicesAvailable: async () => false }, radio().r).readiness() === 'UNSUPPORTED');
  check('missing permission is NEEDS_PERMISSION', await new NearbyTransport(d, radio({ perms: false }).r).readiness() === 'NEEDS_PERMISSION');
  check('Bluetooth off is BLUETOOTH_OFF', await new NearbyTransport(d, radio({ bt: 'off' }).r).readiness() === 'BLUETOOTH_OFF');
  check('no Bluetooth hardware is UNSUPPORTED', await new NearbyTransport(d, radio({ bt: 'unsupported' }).r).readiness() === 'UNSUPPORTED');
  check('Android 11 with location off falls back like Bluetooth off', await new NearbyTransport(d, radio({ sdk: 30, location: false }).r).readiness() === 'BLUETOOTH_OFF');
  check('Android 12+ ignores location services', await new NearbyTransport(d, radio({ sdk: 31, location: false }).r).readiness() === 'READY');
  check('a native error reads as UNSUPPORTED, never throws', await new NearbyTransport({ ...d, isPlayServicesAvailable: async () => { throw new Error('x'); } }, radio().r).readiness() === 'UNSUPPORTED');

  const ready = radio();
  check('READY phone sees no prompt', await new NearbyTransport(d, ready.r).requestReady() === 'READY' && ready.prompts.length === 0);
  const both = radio({ perms: false, bt: 'off' });
  const r1 = await new NearbyTransport(d, both.r).requestReady();
  check('asks permission, then Bluetooth, in that order', r1 === 'READY' && both.prompts.join() === 'permissions,bluetooth', both.prompts.join());
  const denied = radio({ perms: false, grant: false, bt: 'off' });
  const r2 = await new NearbyTransport(d, denied.r).requestReady();
  check('permission refused stops there (no Bluetooth prompt)', r2 === 'NEEDS_PERMISSION' && denied.prompts.join() === 'permissions');
  const declined = radio({ bt: 'off', turnOn: false });
  check('Bluetooth request declined stays BLUETOOTH_OFF', await new NearbyTransport(d, declined.r).requestReady() === 'BLUETOOTH_OFF' && declined.prompts.join() === 'bluetooth');
  const old = radio({ sdk: 30, location: false });
  check('location off is not prompted for (no Settings trip mid-payment)', await new NearbyTransport(d, old.r).requestReady() === 'BLUETOOTH_OFF' && old.prompts.length === 0);
}

// ---- One payment over Bluetooth --------------------------------------------------
{
  const air = new Air();
  const merchantPhone = new Phone('merchant', air), customerPhone = new Phone('customer', air);
  const merchant = new NearbyTransport(merchantPhone.driver(), radio().r);
  const customer = new NearbyTransport(customerPhone.driver(), radio().r);
  const hostP = merchant.host(CODE, timeout(2000));
  await tick();
  const [m, c] = await Promise.all([hostP, customer.join(CODE, timeout(2000))]);
  check('customer joins the merchant with the session code', !!m && !!c);
  check('merchant stops advertising once connected', merchantPhone.advertising === null);
  check('customer stops discovering once connected', customerPhone.discovering === null);

  const voucher = encodeFrame({ type: 'VOUCHER', voucher: { payload: { a: 1 }, signature: 's1' }, customerCertificate: { payload: { b: 'Ìyá Bọ̀sẹ́' }, signature: 's2' }, vaultCertificate: { payload: { c: 3 }, signature: 's3' } } as any);
  await c.send(voucher);
  const got = await m.receive();
  check('voucher frame arrives byte for byte', got === voucher);
  check('and decodes as a voucher', decodeFrame(got).isSuccess && (decodeFrame(got).getValue() as any).type === 'VOUCHER');
  const receipt = encodeFrame({ type: 'RECEIPT', receipt: { payload: { seq: 1 }, signature: 'r' } } as any);
  await m.send(receipt);
  check('receipt comes back on the same channel', await c.receive() === receipt);

  await m.send('one'); await m.send('two'); await tick(20);
  check('frames sent before reading wait in order', await c.receive() === 'one' && await c.receive() === 'two');

  await m.send('x'.repeat(16_001)); await m.send('after'); await tick(20);
  check('oversized text is dropped, not delivered', await c.receive() === 'after');

  const pending = c.receive();
  await m.close();
  let err: unknown; try { await pending; } catch (e) { err = e; }
  check('a waiting read fails when the other phone hangs up', err instanceof NearbyClosed);
  let sendErr: unknown; try { await c.send('late'); } catch (e) { sendErr = e; }
  check('sending after disconnect fails (so the app shows the QR)', sendErr instanceof NearbyClosed);
  await tick(10);
  check('all listeners removed after close', merchantPhone.listeners() === 0 && customerPhone.listeners() === 0, `${merchantPhone.listeners()}/${customerPhone.listeners()}`);
}

// ---- Someone else nearby ---------------------------------------------------------
{
  const air = new Air();
  const merchantPhone = new Phone('merchant', air), customerPhone = new Phone('customer', air), strangerPhone = new Phone('stranger', air);
  const merchant = new NearbyTransport(merchantPhone.driver(), radio().r);
  const hostP = merchant.host(CODE, timeout(2000));
  await tick();
  // The stranger hears the advertised tag and tries to connect without the code.
  const s = strangerPhone.driver();
  await s.startDiscovery('not-the-join-tag');
  await tick(10);
  await s.requestConnection('merchant');
  await tick(10);
  check('a phone without the code is rejected', merchantPhone.calls.includes('reject:stranger') && !merchantPhone.links.has('stranger'));
  check('the broadcast tag reveals nothing usable', sessionTags(CODE).advertise !== sessionTags(CODE).join && !sessionTags(CODE).advertise.includes(CODE.slice(0, 8)));
  const customer = new NearbyTransport(customerPhone.driver(), radio().r);
  const [m] = await Promise.all([hostP, customer.join(CODE, timeout(2000))]);
  check('the real customer still connects afterwards', merchantPhone.links.has('customer'));
  await m.close();
}

// ---- Wrong code, aborts and bad input ---------------------------------------------
{
  const air = new Air();
  const merchantPhone = new Phone('merchant', air), customerPhone = new Phone('customer', air);
  const merchant = new NearbyTransport(merchantPhone.driver(), radio().r);
  const ctl = new AbortController();
  const hostP = merchant.host(CODE, ctl.signal);
  await tick();
  const started = Date.now();
  let joinErr: unknown;
  try { await new NearbyTransport(customerPhone.driver(), radio().r).join('V3JvbmctY29kZS1mcm9tLWEtb2xkLVFS', timeout(300)); } catch (e) { joinErr = e; }
  check('a different session code never connects; the 8 s style deadline rejects it', joinErr instanceof NearbyClosed && Date.now() - started >= 290);
  check('customer stopped discovering after the deadline', customerPhone.discovering === null && customerPhone.listeners() === 0);
  ctl.abort();
  let hostErr: unknown; try { await hostP; } catch (e) { hostErr = e; }
  check('aborting host (voucher was scanned instead) rejects and stops advertising', hostErr instanceof NearbyClosed && merchantPhone.advertising === null && merchantPhone.listeners() === 0);

  const pre = new AbortController(); pre.abort();
  let preErr: unknown; try { await merchant.host(CODE, pre.signal); } catch (e) { preErr = e; }
  check('an already-aborted signal rejects at once', preErr instanceof NearbyClosed && merchantPhone.listeners() === 0);
  let badErr: unknown; try { await merchant.join('short', timeout(100)); } catch (e) { badErr = e; }
  check('a malformed session code is refused', badErr instanceof NearbyClosed);
  let noneErr: unknown; try { await new NearbyTransport(null, null).host(CODE, timeout(100)); } catch (e) { noneErr = e; }
  check('host on a phone without Nearby rejects instead of hanging', noneErr instanceof NearbyClosed);
}

// ---- Merchant radio busy for a moment ----------------------------------------------
{
  const air = new Air();
  const merchantPhone = new Phone('merchant', air), customerPhone = new Phone('customer', air);
  const merchant = new NearbyTransport(merchantPhone.driver(), radio().r);
  const cd = customerPhone.driver();
  let failures = 1;
  const flaky = { ...cd, requestConnection: async (id: string) => { if (failures-- > 0) throw new Error('busy'); return cd.requestConnection(id); } };
  const hostP = merchant.host(CODE, timeout(4000));
  await tick();
  const [m] = await Promise.all([hostP, new NearbyTransport(flaky, radio().r).join(CODE, timeout(4000))]);
  check('a failed connection request is retried', !!m && merchantPhone.links.has('customer'));
  await m.close();
}

{
  let threw = false, rejected = false;
  try { await new NearbyTransport(null, null).join(CODE, timeout(50)).catch(() => { rejected = true; }); } catch { threw = true; }
  check('no-Nearby join returns a rejected promise, never throws', rejected && !threw);
}
  expect(failures).toEqual([]);
}, 20_000);
