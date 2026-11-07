import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, Share2 } from 'lucide-react-native';
import { color, icon, motion, radius, space, touch, type } from '../theme/tokens';
import { Button, HearIt, Panel, Press, Rise, T, money } from '../components/ui';
import { Avatar, CurvedHeader, Screen, Section } from '../components/shell';
import { HoldToConfirm, SampleCode, StatusMark } from '../components/money';
import { CheckDisc } from '../components/icons';
import { useNav } from '../nav';
import { Contact, useStore } from '../demo/store';
import { t } from '../i18n/en';

const spaced = (n: string) => n.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');

function Person({ who, onPress }: { who: Contact; onPress(): void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={`${who.name}, ${who.number}`} onPress={onPress} style={s.person}>
      <Avatar name={who.name} />
      <View style={{ flex: 1 }}>
        <T v="label" numberOfLines={2}>{who.name}</T>
        <T v="small" c={color.muted}>{spaced(who.number)}</T>
      </View>
    </Press>
  );
}

/** Send starts with who. Their name is shown before any amount, so money never goes to a mistyped number. */
export function SendTo() {
  const nav = useNav();
  const { contacts, find } = useStore();
  const [number, setNumber] = useState('');
  const digits = number.replace(/\D/g, '').slice(0, 10);
  const [lookup, setLookup] = useState<{ checking: boolean; found?: Contact }>({ checking: false });
  useEffect(() => {
    if (digits.length !== 10) { setLookup({ checking: false }); return; }
    let live = true;
    setLookup({ checking: true });
    find(digits).then(found => { if (live) setLookup({ checking: false, found }); });
    return () => { live = false; };
  }, [digits]);
  const { checking, found } = lookup;
  const next = (to: Contact) => nav.go({ name: 'amount', mode: 'send', to });
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.sendMoney} />}>
      <View style={{ gap: space.xs }}>
        <T v="label">{t.tpayNumber}</T>
        <TextInput
          accessibilityLabel={t.tpayNumber} value={digits} onChangeText={setNumber} keyboardType="number-pad" maxLength={10}
          placeholder={t.tenDigits} placeholderTextColor={color.muted} style={s.input}
        />
      </View>
      {found && (
        <Rise>
          <Panel style={s.found}>
            <CheckDisc size={icon.md} c={color.green} />
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={2}>{found.name}</T>
              <T v="small" c={color.muted}>{t.verified}</T>
            </View>
          </Panel>
        </Rise>
      )}
      {checking && <View style={s.checking} accessibilityLiveRegion="polite"><ActivityIndicator size="small" color={color.blue} /><T v="body" c={color.muted}>{t.checkingName}</T></View>}
      {digits.length === 10 && !checking && !found && <T v="body" c={color.coral}>{t.numberNotFound}</T>}
      {checking ? null : found
        ? <Button label={t.continue} onPress={() => next(found)} />
        : (
          <Panel>
            <Section title={t.recentPeople} />
            {contacts.map(c => <Person key={c.number} who={c} onPress={() => next(c)} />)}
          </Panel>
        )}
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.row} accessible accessibilityLabel={`${label}, ${value}`}>
      <T v="body" c={color.muted}>{label}</T>
      <T v={strong ? 'heading' : 'label'} style={s.value}>{value}</T>
    </View>
  );
}

export function SendReview({ amount, to }: { amount: number; to: Contact }) {
  const nav = useNav();
  const { active, send } = useStore();
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); const id = await send(amount, to); nav.reset({ name: 'sendDone', amount, to, id }); };
  const say = `Send ${amount} naira to ${to.name}`;
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.checkSend} />}
      footer={<HoldToConfirm label={t.holdToSend} say={say} busy={busy} onDone={go} />}
    >
      <Rise>
        <Panel style={s.big}>
          <T v="body" c={color.muted}>{t.youSend}</T>
          <T v="moneyL">{money(amount)}</T>
          <HearIt say={say} />
        </Panel>
      </Rise>
      <Rise delay={motion.stagger * 2}>
        <Panel>
          <T v="section" accessibilityRole="header">{t.paymentSummary}</T>
          <Row label={t.to} value={to.name} />
          <Row label={t.tpayNumber} value={spaced(to.number)} />
          <Row label={t.fromWallet} value={t.walletActive} />
          <Row label={t.leftAfterThis} value={money(active - amount)} strong />
        </Panel>
      </Rise>
    </Screen>
  );
}

export function SendDone({ amount, to, id }: { amount: number; to: Contact; id: string }) {
  const nav = useNav();
  const say = `${money(amount)} ${t.sentTo} ${to.name}`;
  return (
    <Screen
      head={<CurvedHeader bell={false} title={t.moneySent} />}
      footer={<View style={{ gap: space.sm }}>
        <Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />
        <Button kind="soft" label={t.viewReceipt} onPress={() => { nav.reset({ name: 'home' }); nav.go({ name: 'receipt', id }); }} />
      </View>}
    >
      <Rise>
        <Panel style={s.big}>
          <StatusMark status="paid" size={44} big />
          <T v="moneyL">{money(amount)}</T>
          <T v="label">{`${t.sentTo} ${to.name}`}</T>
        </Panel>
      </Rise>
      <HearIt say={say} />
    </Screen>
  );
}

/** Everything someone needs to pay you: your number and your code, ready to copy or share. */
export function Receive() {
  const nav = useNav();
  const { name, number } = useStore();
  const { width } = useWindowDimensions();
  const size = Math.min(Math.min(width, 390) - 130, 200);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await Clipboard.setStringAsync(number).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const share = () => { Share.share({ message: `${t.payMeOn} ${name}: ${number}` }).catch(() => {}); };
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.receiveMoney} />}>
      <Rise>
        <Panel style={s.big}>
          <SampleCode size={size} seed={9} />
          <T v="heading" numberOfLines={2}>{name}</T>
          <T v="small" c={color.muted}>{t.tpayNumber}</T>
          <T v="money" accessibilityLabel={number} style={s.nums}>{spaced(number)}</T>
        </Panel>
      </Rise>
      <View style={s.two}>
        <Button style={{ flex: 1 }} kind="soft" label={copied ? t.copied : t.copyNumber}
          icon={copied ? <Check size={icon.md} color={color.green} strokeWidth={2} /> : <Copy size={icon.md} color={color.text} strokeWidth={1.8} />} onPress={copy} />
        <Button style={{ flex: 1 }} kind="soft" label={t.shareDetails} icon={<Share2 size={icon.md} color={color.text} strokeWidth={1.8} />} onPress={share} />
      </View>
      <Button label={t.askExact} onPress={() => nav.go({ name: 'amount', mode: 'collect' })} />
      <T v="small" c={color.muted} style={s.center}>{t.receiveNote}</T>
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { ...type.heading, color: color.text, height: touch.field, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.md, fontVariant: ['tabular-nums'] },
  found: { flexDirection: 'row', alignItems: 'center' },
  checking: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  value: { flexShrink: 1, textAlign: 'right' },
  big: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  two: { flexDirection: 'row', gap: space.sm },
  center: { textAlign: 'center' },
  nums: { fontVariant: ['tabular-nums'] },
});
