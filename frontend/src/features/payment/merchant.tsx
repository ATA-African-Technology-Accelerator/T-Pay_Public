import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Bluetooth, BluetoothOff, Check, Copy } from 'lucide-react-native';
import { color, icon, motion, space } from '../../theme/tokens';
import { Button, HearIt, Panel, Rise, T, money, sayNaira, speakNaturally } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { FrameCode, StatusMark, Steps } from '../../components/money';
import type { VoucherStatus } from '@tpay/shared/contracts/statuses';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import { syncNow } from '../../sync/syncCoordinator';
import { api, connectivity } from '../../composition';
import { withSession } from '../../session/guard';
import { createRequest, takeVoucher, type OpenRequest, type PaymentRefusal } from './payments';
import { bluetoothReady, closeLink, hostLink, linkChannel, sendFrame } from './link';

/** A payment T-Pay already has: the customer's phone sent it while this one waited. */
export interface OnlinePayment { amountNgnMinor: number; from: string; status: VoucherStatus }

const useCodeSize = () => { const { width } = useWindowDimensions(); return Math.min(Math.min(width, 390) - 96, 260); };

// ---- The merchant's open request, kept across the scanner and back ------------------

type MerchantResult =
  | { ok: true; voucherId: string; bluetooth: boolean }
  | { ok: true; online: OnlinePayment }
  | { ok: false; code: PaymentRefusal; existingId?: string; amount: number };
type Session = { amount: number; open: OpenRequest; result: MerchantResult | null };
let session: Session | null = null;
// Kept apart from the session: the screen starts watching before its request exists (the request is
// made a moment after the screen opens), and a payment must never arrive with nobody watching.
const watchers = new Set<(r: MerchantResult) => void>();

function finish(result: MerchantResult) {
  if (!session || session.result) return;
  session.result = result;
  watchers.forEach(w => w(result));
}

// With network, the customer's phone sends the payment to T-Pay the moment it is made. Asking T-Pay
// every few seconds lets this phone move on even when no Bluetooth link was made and nobody scanned.
const ASK_EVERY_MS = 3_000;
// T-Pay refused it: no money came, so keep waiting for a payment that counts.
const REFUSED: VoucherStatus[] = ['REJECTED_CONFLICT', 'REJECTED_OVERSPEND', 'SETTLEMENT_BLOCKED'];

async function askTPay(current: Session) {
  if (session !== current || current.result || !(await connectivity.isOnline())) return;
  try {
    const { items } = await withSession(() => api.listVouchers());
    const paid = items.find(v => v.view === 'PAYEE' && v.requestNonce === current.open.request.payload.nonce && !REFUSED.includes(v.status));
    if (paid && session === current) {
      finish({ ok: true, online: { amountNgnMinor: paid.amountNgnMinor, from: paid.counterpartyName, status: paid.status } });
      closeLink();
      void syncNow();
    }
  } catch { /* no answer this time: Bluetooth, a scan or the next ask */ }
}

/** ACT-08 over Bluetooth: one voucher in, one receipt back on the same channel. */
async function listen(current: Session) {
  const channel = await linkChannel();
  if (!channel || session !== current) return;
  let frame: string;
  try { frame = await channel.receive(); } catch { return; }
  if (session !== current || current.result) return;
  const taken = await takeVoucher(frame, current.open);
  if (!taken.ok) {
    finish({ ok: false, code: taken.code, existingId: taken.existing?.id, amount: current.amount });
    closeLink();
    return;
  }
  const sent = await sendFrame(channel, taken.value.frame);
  finish({ ok: true, voucherId: taken.value.id, bluetooth: sent });
  void syncNow();
}

/** Ends the merchant's activity: no more hosting, and a new request next time. */
export function endMerchantSession() {
  session = null;
  closeLink();
}

/** Moves on as soon as a payment arrives, whichever screen the merchant is on. */
export function useMerchantResult() {
  const nav = useNav();
  useEffect(() => {
    const go = (r: MerchantResult) => {
      if (!r.ok) nav.go({ name: 'refusal', code: r.code, side: 'merchant', amount: r.amount, existingId: r.existingId });
      else if ('online' in r) nav.reset({ name: 'paidOnline', payment: r.online });
      else nav.reset({ name: 'credit', voucherId: r.voucherId, bluetooth: r.bluetooth });
    };
    if (session?.result) { go(session.result); return; }
    watchers.add(go);
    return () => { watchers.delete(go); };
  }, []);
}

// ---- Screens ---------------------------------------------------------------------

/** ACT-06. Shows the signed request; with Bluetooth the payment arrives with no second scan. */
export function Request({ amount, handsFree = false }: { amount: number; handsFree?: boolean }) {
  const nav = useNav();
  const size = useCodeSize();
  const [open, setOpen] = useState<OpenRequest | null>(session?.amount === amount ? session.open : null);
  const [copied, setCopied] = useState(false);
  useMerchantResult();
  // Hands free, say what to do next: the payment then arrives, and is announced, by itself.
  useEffect(() => { if (handsFree) void speakNaturally(`${t.showCustomer}. ${sayNaira(amount)}`); }, []);

  useEffect(() => {
    if (open) return;
    let live = true;
    (async () => {
      const bluetooth = await bluetoothReady();
      const made = await createRequest(amount, bluetooth);
      if (!live) return;
      if (!made.ok) { nav.go({ name: 'refusal', code: made.code, side: 'merchant', amount }); return; }
      endMerchantSession();
      session = { amount, open: made.value, result: null };
      if (made.value.sessionCode) { hostLink(made.value.sessionCode); void listen(session); }
      setOpen(made.value);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!open || !session) return;
    const current = session;
    const timer = setInterval(() => { void askTPay(current); }, ASK_EVERY_MS);
    return () => clearInterval(timer);
  }, [open]);

  const copy = async () => {
    if (!open) return;
    await Clipboard.setStringAsync(open.frame).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // With Bluetooth the payment arrives by itself: the customer's one scan is all it takes, so
  // scanning their phone is only a fallback. Without Bluetooth it is the way the payment comes in.
  const scanTheirs = open ? () => nav.go({ name: 'scan', kind: 'voucher', open }) : undefined;
  const footer = open && !open.sessionCode && scanTheirs ? <Button label={t.scanVoucherGo} onPress={scanTheirs} /> : undefined;
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.showCustomer} />} footer={footer}>
      <Steps at={1} />
      <Rise>
        <Panel style={s.center}>
          {open ? <FrameCode value={open.frame} size={size} label={t.showCustomer} /> : <View style={[s.wait, { height: size }]}><ActivityIndicator color={color.blue} /></View>}
        </Panel>
      </Rise>
      <T v="moneyL" style={s.text}>{money(amount)}</T>
      <View style={s.state}><StatusMark status="pending" size={22} /><T v="label">{t.waiting}</T></View>
      {open && (
        <View style={s.state} accessible accessibilityLiveRegion="polite">
          {open.sessionCode ? <Bluetooth size={icon.sm} color={color.blue} strokeWidth={1.8} /> : <BluetoothOff size={icon.sm} color={color.muted} strokeWidth={1.8} />}
          <T v="small" c={color.muted} style={{ flexShrink: 1 }}>{open.sessionCode ? t.bluetoothOn : t.bluetoothOff}</T>
        </View>
      )}
      {open?.sessionCode && scanTheirs && <Button kind="quiet" label={t.scanVoucherGo} onPress={scanTheirs} />}
      {open && (
        <Button kind="quiet" label={copied ? t.copied : t.copyCode} onPress={() => { void copy(); }}
          icon={copied ? <Check size={icon.md} color={color.green} strokeWidth={2} /> : <Copy size={icon.md} color={color.text} strokeWidth={1.8} />} />
      )}
    </Screen>
  );
}

/** Money is in, but only as Processing until the backend settles it. */
export function Credit({ voucherId, bluetooth, again }: { voucherId: string; bluetooth: boolean; again?: boolean }) {
  const nav = useNav();
  const size = useCodeSize();
  const { vouchers } = useApp();
  const v = vouchers.find(x => x.id === voucherId);
  // The customer never has to scan a receipt. The code is only there if they want to.
  const [showCode, setShowCode] = useState(false);
  useEffect(() => { if (!again) endMerchantSession(); }, []);
  if (!v) return <Screen head={<CurvedHeader home title={t.gotMoney} />}><T v="body" c={color.muted}>{t.loading}</T></Screen>;
  const amount = v.voucher.payload.amountNgnMinor;
  return (
    <Screen head={<CurvedHeader bell={false} title={t.gotMoney} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
      <Steps at={3} />
      <Rise>
        <Panel style={s.row}>
          <StatusMark status="pending" size={44} />
          <View style={{ flex: 1 }}>
            <T v="money" numberOfLines={1} adjustsFontSizeToFit>{money(amount)}</T>
            <T v="small" c={color.muted} numberOfLines={1}>{v.counterparty}</T>
            <T v="small" c={color.amber}>{t.status.pending}</T>
          </View>
        </Panel>
      </Rise>
      {!showCode && (
        <Rise delay={motion.stagger * 2}>
          {bluetooth && <View style={s.state}><Bluetooth size={icon.sm} color={color.blue} strokeWidth={1.8} /><T v="label">{t.sentByBluetooth}</T></View>}
          <Button kind="quiet" label={t.showReceiptCode} onPress={() => setShowCode(true)} />
        </Rise>
      )}
      {showCode && (
        <Rise delay={motion.stagger * 2}>
          <Panel style={s.center}><FrameCode value={v.frame} size={size} label={t.customerScans} /><T v="label">{t.customerScans}</T></Panel>
        </Rise>
      )}
      <T v="body" c={color.muted} style={s.text}>{t.pendingPaid}</T>
      <HearIt auto say={`${t.gotMoney}. ${sayNaira(amount)}. ${t.pendingPaid}`} />
    </Screen>
  );
}

/** The customer's phone already sent the payment to T-Pay, so it is shown as T-Pay has it. */
export function PaidOnline({ payment }: { payment: OnlinePayment }) {
  const nav = useNav();
  useEffect(() => { endMerchantSession(); }, []);
  const settled = payment.status === 'SETTLED';
  return (
    <Screen head={<CurvedHeader bell={false} title={t.gotMoney} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
      <Steps at={3} />
      <Rise>
        <Panel style={s.row}>
          <StatusMark status={settled ? 'paid' : 'pending'} size={44} />
          <View style={{ flex: 1 }}>
            <T v="money" numberOfLines={1} adjustsFontSizeToFit>{money(payment.amountNgnMinor)}</T>
            <T v="small" c={color.muted} numberOfLines={1}>{payment.from}</T>
            <T v="small" c={settled ? color.green : color.amber}>{settled ? t.status.paid : t.status.pending}</T>
          </View>
        </Panel>
      </Rise>
      <T v="body" c={color.muted} style={s.text}>{settled ? t.paidOnlineSettled : t.pendingPaid}</T>
      <HearIt auto say={`${t.gotMoney}. ${sayNaira(payment.amountNgnMinor)}. ${settled ? t.paidOnlineSettled : t.pendingPaid}`} />
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center' },
  text: { textAlign: 'center' },
  wait: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  state: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
