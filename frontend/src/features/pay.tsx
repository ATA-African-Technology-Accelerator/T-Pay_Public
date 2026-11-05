import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { color, icon, motion, radius, space } from '../theme/tokens';
import { Keypad } from '../components/keypad';
import { Button, Card, HearIt, Panel, Rise, T, money, naira, native, useCardW, useReduceMotion } from '../components/ui';
import { Avatar, CurvedHeader, Screen } from '../components/shell';
import { HoldToConfirm, NoteStack, SampleCode, StatusMark, Steps } from '../components/money';
import { Duo } from '../components/rows';
import { useNav } from '../nav';
import { Contact, DEMO_RATE, useStore } from '../demo/store';
import { t } from '../i18n/en';
import { CheckDisc, NairaDisc, WalletDisc } from '../components/icons';

const MAX = 200000;
const HOURS = [6, 12, 24];

/** Amount entry: one calm panel for the figure, the action, then a large keypad. */
export function Amount({ mode, to }: { mode: 'lock' | 'collect' | 'send'; to?: Contact }) {
  const nav = useNav();
  const { active } = useStore();
  const lock = mode === 'lock';
  const sending = mode === 'send' && !!to;
  const cap = lock || sending ? active : MAX;
  const [amount, setAmount] = useState(0);
  const [hours, setHours] = useState(24);
  const next = () => nav.go(sending ? { name: 'sendReview', amount, to: to! } : lock ? { name: 'vaultReview', amount, hours } : { name: 'request', amount });
  const press = (k: string) => setAmount(a => (k === 'del' ? Math.floor(a / 10) : Math.min(Number(`${a}${k}`), cap)));
  return (
    <Screen head={<CurvedHeader back bell={false} title={sending ? t.howMuchSend : lock ? t.howMuchLock : t.howMuchCollect} />}>
      <Panel style={p.amount}>
        <T v="small" c={color.muted} numberOfLines={1}>{sending ? `${t.sendingTo} ${to!.name}` : lock ? t.amountLock : t.amountCollect}</T>
        <T v="moneyL" c={amount ? color.text : color.muted} numberOfLines={1} accessibilityLiveRegion="polite">{naira(amount)}</T>
        {(lock || sending) && <T v="small" c={color.muted}>{`${t.availableNow}: ${money(active)}`}</T>}
      </Panel>
      {lock && (
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel={t.howLong}>
          <T v="smallStrong" c={color.muted}>{t.howLong}</T>
          <View style={p.chips}>
            {HOURS.map(h => (
              <Pressable key={h} accessibilityRole="radio" accessibilityState={{ selected: h === hours }} accessibilityLabel={`${h} ${t.hours}`} onPress={() => setHours(h)} style={[p.chip, h === hours && p.chipOn]}>
                <T v="label" c={h === hours ? color.text : color.muted}>{`${h} ${t.hours}`}</T>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Button label={!amount ? t.enterAmount : t.continue} disabled={!amount} onPress={next} />
      <Keypad onKey={press} />
    </Screen>
  );
}

const SCAN = {
  request: { at: 1 as const, title: t.scanSeller, hint: t.noNetworkNeeded },
  voucher: { at: 2 as const, title: t.scanVoucher, hint: t.scanVoucherHint },
  receipt: { at: 3 as const, title: t.scanReceipt, hint: t.scanReceiptHint },
};

/** The one camera screen. What it is looking for decides what happens next. */
export function Scan({ kind, amount }: { kind: 'request' | 'voucher' | 'receipt'; amount: number }) {
  const nav = useNav();
  const { left } = useStore();
  const reduce = useReduceMotion();
  const w = useCardW();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: motion.sweep, easing: motion.ease.inOut, useNativeDriver: native }),
      Animated.timing(a, { toValue: 0, duration: motion.sweep, easing: motion.ease.inOut, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  const cfg = SCAN[kind];
  const ask = (n: number) => nav.go(n > left ? { name: 'refused', amount: n } : { name: 'review', amount: n });
  return (
    <Screen head={<CurvedHeader back bell={false} title={cfg.title} />}>
      <Steps at={cfg.at} />
      <Card w={w} h={270} fill={color.panel} pill={<T v="smallStrong" c={color.white}>{t.noNetwork}</T>}>
        <View style={p.frame} accessibilityLabel="Camera view">
          {(['tl', 'tr', 'bl', 'br'] as const).map(k => <View key={k} style={[p.corner, p[k]]} />)}
          <Animated.View style={[p.sweep, { transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 136] }) }] }]} />
        </View>
      </Card>
      <T v="body" c={color.muted} style={p.center}>{cfg.hint}</T>
      <T v="small" c={color.muted} style={p.center}>{t.demo}</T>
      {kind === 'request' && <>
        <Button label={t.sampleAsk2000} onPress={() => ask(2000)} />
        <Button label={t.sampleAsk90000} kind="soft" onPress={() => ask(90000)} />
      </>}
      {kind === 'voucher' && <>
        <Button label={t.sampleValid} onPress={() => nav.reset({ name: 'credit', amount })} />
        <Button label={t.sampleTampered} kind="soft" onPress={() => nav.go({ name: 'tampered', amount })} />
        <Button label={t.sampleDuplicate} kind="soft" onPress={() => nav.go({ name: 'duplicate', amount })} />
      </>}
      {kind === 'receipt' && <Button label={t.sampleValid} onPress={() => nav.reset({ name: 'delivered', amount })} />}
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={p.sumRow} accessible accessibilityLabel={`${label}, ${value}`}>
      <T v="body" c={color.muted}>{label}</T>
      <T v={strong ? 'heading' : 'label'} style={p.sumValue}>{value}</T>
    </View>
  );
}

export function Review({ amount }: { amount: number }) {
  const nav = useNav();
  const { left, seller, pay } = useStore();
  const say = `Pay ${amount} naira to ${seller}`;
  const usd = (amount / DEMO_RATE).toFixed(2);
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.checkPay} />}
      footer={<HoldToConfirm label={t.holdToPay} say={say} onDone={() => { pay(amount); nav.reset({ name: 'voucher', amount }); }} />}
    >
      <Rise>
        <Panel style={p.center2}>
          <T v="body" c={color.muted}>{t.youPay}</T>
          <T v="moneyL">{money(amount)}</T>
          <NoteStack amount={amount} />
          <HearIt say={say} />
        </Panel>
      </Rise>
      <Rise delay={motion.stagger * 2}>
        <Panel>
          <T v="section" accessibilityRole="header">{t.paymentSummary}</T>
          <View style={p.row}>
            <Avatar name={seller} />
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={2}>{seller}</T>
              <T v="small" c={color.muted}>{t.verified}</T>
            </View>
            <CheckDisc size={icon.md} c={color.green} />
          </View>
          <Row label={t.fromWallet} value={t.walletOffline} />
          <Row label={t.amountUsd} value={`$${usd}`} />
          <Row label={t.demoRate} value={`₦${DEMO_RATE.toLocaleString('en-US')}.00 ${t.ngnPerUsd}`} />
          <Row label={t.leftAfterThis} value={money(left - amount)} strong />
        </Panel>
      </Rise>
    </Screen>
  );
}

function Stop({ say, children, footer }: { say: string; children: React.ReactNode; footer: React.ReactNode }) {
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.sequence([-7, 6, -4, 0].map(toValue => Animated.timing(x, { toValue, duration: motion.shake, useNativeDriver: native }))).start();
  }, []);
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.checkPay} />} footer={footer}>
      <Animated.View style={{ transform: [{ translateX: x }], gap: space.md }}>{children}</Animated.View>
      <HearIt say={say} />
    </Screen>
  );
}

export function Refused({ amount }: { amount: number }) {
  const nav = useNav();
  const { left } = useStore();
  return (
    <Stop say={`${t.tooMuch}. ${t.nothingMoved}`} footer={<Button label={t.backHome} onPress={() => nav.reset({ name: 'home' })} />}>
      <Panel style={p.stop}>
        <StatusMark status="refused" size={44} />
        <T v="hello">{t.notEnough}</T>
        <T v="body" c={color.muted}>{t.nothingMoved}</T>
      </Panel>
      <Duo items={[
        { label: t.sellerAskedShort, value: money(amount), fill: color.amber, icon: <NairaDisc size={icon.md} c={color.ink} /> },
        { label: t.haveShort, value: money(left), fill: color.green, icon: <WalletDisc size={icon.md} c={color.ink} /> },
      ]} />
    </Stop>
  );
}

export function Tampered({ amount }: { amount: number }) {
  const nav = useNav();
  return (
    <Stop say={`${t.dontGive}. ${t.tamperedWhy}`} footer={<Button label={t.scanAgain} onPress={() => nav.back()} />}>
      <Panel style={p.stop}>
        <StatusMark status="refused" size={44} />
        <T v="hello">{t.dontGive}</T>
        <T v="body" c={color.muted}>{t.tamperedWhy}</T>
      </Panel>
      <Panel><Row label={t.amountCollect} value={money(amount)} /><Row label={t.creditAdded} value={naira(0)} strong /></Panel>
    </Stop>
  );
}

export function Duplicate({ amount }: { amount: number }) {
  const nav = useNav();
  return (
    <Stop say={`${t.alreadyTook}. ${t.countedOnce}`} footer={<Button label={t.showReceiptAgain} onPress={() => nav.reset({ name: 'credit', amount, again: true })} />}>
      <Panel style={p.stop}>
        <StatusMark status="blocked" size={44} />
        <T v="hello">{t.alreadyTook}</T>
        <T v="body" c={color.muted}>{t.countedOnce}</T>
      </Panel>
      <Panel><Row label={t.amountCollect} value={money(amount)} strong /></Panel>
    </Stop>
  );
}

export function Voucher({ amount }: { amount: number }) {
  const nav = useNav();
  const { width } = useWindowDimensions();
  const size = Math.min(Math.min(width, 390) - 110, 230);
  return (
    <Screen head={<CurvedHeader bell={false} title={t.showSeller} />} footer={<Button label={t.scanReceiptGo} onPress={() => nav.go({ name: 'scan', kind: 'receipt', amount })} />}>
      <Steps at={2} />
      <Rise><Panel style={p.center2}><SampleCode size={size} /></Panel></Rise>
      <T v="moneyL" style={p.center}>{money(amount)}</T>
      <View style={p.state}><StatusMark status="sent" size={22} /><T v="label">{t.sentNotConfirmed}</T></View>
    </Screen>
  );
}

export function Delivered({ amount }: { amount: number }) {
  const nav = useNav();
  const { seller } = useStore();
  const say = `${t.sellerHas}. ${amount} naira. ${t.settlesItself}`;
  return (
    <Screen head={<CurvedHeader bell={false} title={t.paymentSent} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
      <Rise>
        <Panel style={p.stop}>
          <StatusMark status="pending" size={44} />
          <T v="title">{t.sellerHas}</T>
          <T v="moneyL" numberOfLines={1}>{money(amount)}</T>
          <T v="small" c={color.muted} numberOfLines={2}>{seller}</T>
        </Panel>
      </Rise>
      <T v="body" c={color.muted} style={p.center}>{t.settlesItself}</T>
      <HearIt say={say} />
    </Screen>
  );
}

export const p = StyleSheet.create({
  center: { textAlign: 'center' },
  center2: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stop: { gap: space.xs, paddingVertical: space.xl },
  amount: { gap: space.hair, paddingVertical: space.lg },
  chips: { flexDirection: 'row', gap: space.sm },
  chip: { flex: 1, minHeight: 48, borderRadius: radius.md, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  chipOn: { backgroundColor: color.panelHigh, borderColor: color.blue },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  sumValue: { flexShrink: 1, textAlign: 'right' },
  frame: { position: 'absolute', left: 26, right: 26, top: 74, bottom: 26 },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: color.blue },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.md },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.md },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.md },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.md },
  sweep: { position: 'absolute', top: 16, left: 8, right: 8, height: 3, borderRadius: radius.pill, backgroundColor: color.blue },
  state: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
});
