import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AlertCircle, Check, Copy } from 'lucide-react-native';
import { color, icon, motion, space } from '../../theme/tokens';
import { Button, HearIt, Panel, Rise, T, money, rate, sayNaira, usd } from '../../components/ui';
import { Avatar, CurvedHeader, Screen } from '../../components/shell';
import { FrameCode, HoldToConfirm, NoteStack, StatusMark, Steps } from '../../components/money';
import { CheckDisc } from '../../components/icons';
import { Line } from '../../components/rows';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import { syncNow } from '../../sync/syncCoordinator';
import { store } from '../../composition';
import { pay, takeReceipt, type ScannedRequest } from './payments';
import { JOIN_DEADLINE_MS, LATE_LINK_MS, REPLY_DEADLINE_MS, bluetoothReady, closeLink, hasLink, joinLink, linkChannel, receiveFrame, sendFrame } from './link';

const useCodeSize = () => { const { width } = useWindowDimensions(); return Math.min(Math.min(width, 390) - 96, 280); };

/** ACT-07. Everything here was checked offline before the screen opened; nothing is signed yet. */
export function Review({ scanned, expected, handsFree = false }: { scanned: ScannedRequest; expected?: number; handsFree?: boolean }) {
  const nav = useNav();
  const { offline } = useApp();
  const [busy, setBusy] = useState(false);
  const paid = useRef(false);
  const { review } = scanned;
  const amount = review.amountNgnMinor;

  useEffect(() => {
    // Join in the background while the person reads, so Pay sends at once.
    if (scanned.sessionCode) {
      const code = scanned.sessionCode;
      void bluetoothReady().then(ready => { if (ready && !paid.current) joinLink(code); });
    }
    return () => { if (!paid.current) closeLink(); };
  }, []);

  const go = async () => {
    setBusy(true);
    const signed = await pay(scanned);
    if (!signed.ok) { setBusy(false); nav.go({ name: 'refusal', code: signed.code, side: 'customer', amount }); return; }
    paid.current = true;
    void syncNow();
    const v = signed.value;
    const channel = hasLink() ? await linkChannel(JOIN_DEADLINE_MS) : null;
    if (channel && (await sendFrame(channel, v.frame))) {
      const reply = await receiveFrame(channel);
      if (reply && (await takeReceipt(reply, v.id)).ok) {
        closeLink();
        nav.reset({ name: 'delivered', voucherId: v.id });
        return;
      }
    }
    // Not connected within the deadline, or no receipt yet. The link stays open: the voucher
    // screen keeps trying Bluetooth and shows the QR only as a last resort.
    nav.reset({ name: 'voucher', voucherId: v.id });
  };

  const say = t.sayPay(sayNaira(amount), review.merchantName);
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.checkPay} />}
      footer={<HoldToConfirm label={t.holdToPay} say={say} busy={busy} onDone={() => { void go(); }} />}
    >
      {expected !== undefined && expected !== amount && (
        <Panel style={s.warn}>
          <AlertCircle size={icon.md} color={color.amber} strokeWidth={1.8} />
          <T v="label" style={{ flex: 1 }}>{t.amountDiffers(money(amount))}</T>
        </Panel>
      )}
      <Rise>
        <Panel style={s.center}>
          <T v="body" c={color.muted}>{t.youPay}</T>
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(amount)}</T>
          <NoteStack amount={amount} />
          <HearIt auto={handsFree} say={`${say}. ${t.holdToPay}`} />
        </Panel>
      </Rise>
      <Rise delay={motion.stagger * 2}>
        <Panel>
          <T v="section" accessibilityRole="header">{t.paymentSummary}</T>
          <View style={s.row}>
            <Avatar name={review.merchantName} />
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={2}>{review.merchantName}</T>
              <T v="small" c={color.muted}>{t.verified}</T>
            </View>
            <CheckDisc size={icon.md} c={color.green} />
          </View>
          <Line label={t.fromWallet} value={t.walletOffline} />
          <Line label={t.amountUsd} value={usd(review.amountUsdMinor)} />
          <Line label={t.demoRate} value={`${rate(review.fxRate)} ${t.ngnPerUsd}`} />
          <Line label={t.leftAfterThis} value={money(Math.max(0, offline.leftNgn - amount))} strong />
        </Panel>
      </Rise>
    </Screen>
  );
}

/** The signed voucher as a QR, shown again exactly as signed whenever it is reopened. */
export function Voucher({ voucherId }: { voucherId: string }) {
  const nav = useNav();
  const size = useCodeSize();
  const { vouchers } = useApp();
  const v = vouchers.find(x => x.id === voucherId);
  const [copied, setCopied] = useState(false);

  const [sentByBluetooth, setSentByBluetooth] = useState(false);
  const [trying, setTrying] = useState(hasLink());

  // The QR scan was one way: the payment itself goes to the seller over Bluetooth. A link that
  // opened after the Pay deadline still carries it, and the seller's receipt comes back on it.
  // Nobody has to scan a receipt: the payment is saved and settles when either phone has network.
  useEffect(() => {
    let live = true;
    void (async () => {
      const channel = hasLink() ? await linkChannel(LATE_LINK_MS) : null;
      // Read from the phone's database: the screen's copy may not have loaded yet.
      const saved = channel && live ? await store.vouchers.find(voucherId) : null;
      if (!channel || !live || !saved) { if (live) setTrying(false); return; }
      if (!(await sendFrame(channel, saved.frame)) || !live) { if (live) setTrying(false); return; }
      setSentByBluetooth(true);
      const reply = await receiveFrame(channel, REPLY_DEADLINE_MS);
      if (live && reply && (await takeReceipt(reply, voucherId)).ok) { closeLink(); nav.reset({ name: 'delivered', voucherId }); }
    })();
    return () => { live = false; };
  }, []);

  if (!v) return <Screen head={<CurvedHeader home title={t.showSeller} />}><T v="body" c={color.muted}>{t.loading}</T></Screen>;
  const delivered = v.receipt !== null;
  const copy = async () => { await Clipboard.setStringAsync(v.frame).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  return (
    <Screen
      head={<CurvedHeader home title={t.showSeller} />}
      footer={<Button label={t.done} onPress={() => { closeLink(); nav.reset({ name: 'home' }); }} />}
    >
      <Steps at={2} />
      <Rise><Panel style={s.center}><FrameCode value={v.frame} size={size} label={t.showSeller} /></Panel></Rise>
      <T v="moneyL" style={s.text}>{money(v.voucher.payload.amountNgnMinor)}</T>
      <View style={s.state}>
        <StatusMark status={delivered ? 'pending' : 'sent'} size={22} />
        <T v="label">{delivered || sentByBluetooth ? t.sellerHas : t.sentNotConfirmed}</T>
      </View>
      <T v="small" c={color.muted} style={s.text}>{sentByBluetooth ? t.settlesItself : trying ? t.showToSeller : t.showCodeToSeller}</T>
      <Button kind="quiet" label={copied ? t.copied : t.copyCode} onPress={() => { void copy(); }}
        icon={copied ? <Check size={icon.md} color={color.green} strokeWidth={2} /> : <Copy size={icon.md} color={color.text} strokeWidth={1.8} />} />
    </Screen>
  );
}

export function Delivered({ voucherId }: { voucherId: string }) {
  const nav = useNav();
  const { vouchers } = useApp();
  const v = vouchers.find(x => x.id === voucherId);
  useEffect(() => { closeLink(); void syncNow(); }, []);
  if (!v) return <Screen head={<CurvedHeader home title={t.paymentSent} />}><T v="body" c={color.muted}>{t.loading}</T></Screen>;
  const amount = v.voucher.payload.amountNgnMinor;
  const say = `${t.sellerHas}. ${sayNaira(amount)}. ${t.settlesItself}`;
  return (
    <Screen head={<CurvedHeader bell={false} title={t.paymentSent} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
      <Rise>
        <Panel style={s.stop}>
          <StatusMark status="pending" size={44} />
          <T v="title">{t.sellerHas}</T>
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(amount)}</T>
          <T v="small" c={color.muted} numberOfLines={2}>{v.counterparty}</T>
        </Panel>
      </Rise>
      <T v="body" c={color.muted} style={s.text}>{t.settlesItself}</T>
      <HearIt auto say={say} />
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center' },
  text: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  state: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  stop: { gap: space.xs, paddingVertical: space.xl, alignItems: 'center' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
