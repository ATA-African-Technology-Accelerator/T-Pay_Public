import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Bluetooth, BluetoothOff, Check, Copy } from 'lucide-react-native';
import { color, icon, motion, space } from '../../theme/tokens';
import { Button, HearIt, Panel, Rise, T, money, sayNaira } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { FrameCode, StatusMark, Steps } from '../../components/money';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import { syncNow } from '../../sync/syncCoordinator';
import { createRequest, takeVoucher, type OpenRequest, type PaymentRefusal } from './payments';
import { bluetoothReady, closeLink, hostLink, linkChannel, sendFrame } from './link';

const useCodeSize = () => { const { width } = useWindowDimensions(); return Math.min(Math.min(width, 390) - 96, 260); };

// ---- The merchant's open request, kept across the scanner and back ------------------

type MerchantResult = { ok: true; voucherId: string; bluetooth: boolean } | { ok: false; code: PaymentRefusal; existingId?: string; amount: number };
type Session = { amount: number; open: OpenRequest; result: MerchantResult | null; listeners: Set<(r: MerchantResult) => void> };
let session: Session | null = null;

function finish(result: MerchantResult) {
  if (!session || session.result) return;
  session.result = result;
  session.listeners.forEach(l => l(result));
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
    if (!session) return;
    const go = (r: MerchantResult) => {
      if (r.ok) nav.reset({ name: 'credit', voucherId: r.voucherId, bluetooth: r.bluetooth });
      else nav.go({ name: 'refusal', code: r.code, side: 'merchant', amount: r.amount, existingId: r.existingId });
    };
    if (session.result) { go(session.result); return; }
    session.listeners.add(go);
    const current = session;
    return () => { current.listeners.delete(go); };
  }, []);
}

// ---- Screens ---------------------------------------------------------------------

/** ACT-06. Shows the signed request; with Bluetooth the payment arrives with no second scan. */
export function Request({ amount }: { amount: number }) {
  const nav = useNav();
  const size = useCodeSize();
  const [open, setOpen] = useState<OpenRequest | null>(session?.amount === amount ? session.open : null);
  const [copied, setCopied] = useState(false);
  useMerchantResult();

  useEffect(() => {
    if (open) return;
    let live = true;
    (async () => {
      const bluetooth = await bluetoothReady();
      const made = await createRequest(amount, bluetooth);
      if (!live) return;
      if (!made.ok) { nav.go({ name: 'refusal', code: made.code, side: 'merchant', amount }); return; }
      endMerchantSession();
      session = { amount, open: made.value, result: null, listeners: new Set() };
      if (made.value.sessionCode) { hostLink(made.value.sessionCode); void listen(session); }
      setOpen(made.value);
    })();
    return () => { live = false; };
  }, []);

  const copy = async () => {
    if (!open) return;
    await Clipboard.setStringAsync(open.frame).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const footer = open ? <Button label={t.scanVoucherGo} onPress={() => nav.go({ name: 'scan', kind: 'voucher', open })} /> : undefined;
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
  const [showCode, setShowCode] = useState(!bluetooth);
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
      {bluetooth && !showCode && (
        <Rise delay={motion.stagger * 2}>
          <View style={s.state}><Bluetooth size={icon.sm} color={color.blue} strokeWidth={1.8} /><T v="label">{t.sentByBluetooth}</T></View>
          <Button kind="quiet" label={t.showReceiptCode} onPress={() => setShowCode(true)} />
        </Rise>
      )}
      {showCode && (
        <Rise delay={motion.stagger * 2}>
          <Panel style={s.center}><FrameCode value={v.frame} size={size} label={t.customerScans} /><T v="label">{t.customerScans}</T></Panel>
        </Rise>
      )}
      <T v="body" c={color.muted} style={s.text}>{t.pendingPaid}</T>
      <HearIt say={`${t.gotMoney}. ${sayNaira(amount)}. ${t.pendingPaid}`} />
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
