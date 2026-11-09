import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ChevronRight, Globe, HelpCircle, Lock, Mic, ShieldCheck, UserRound } from 'lucide-react-native';
import { color, icon, motion, radius, space, touch, type } from '../theme/tokens';
import { Button, HearIt, Panel, Press, T, money, native, useReduceMotion } from '../components/ui';
import { Avatar, CurvedHeader, Screen, Section } from '../components/shell';
import { ActivityRows, Segment } from '../components/rows';
import { useNav } from '../nav';
import { DEMO_RATE, useStore } from '../demo/store';
import { t } from '../i18n/en';

export function Activity() {
  const { history } = useStore();
  const [show, setShow] = useState<'all' | 'in' | 'out' | 'pending'>('all');
  const rows = history.filter(e => (show === 'all' ? true : show === 'pending' ? e.status === 'pending' : e.dir === show));
  return (
    <Screen tabsFor="activity" head={<CurvedHeader home title={t.activity} />}>
      <Segment<'all' | 'in' | 'out' | 'pending'> value={show} onChange={setShow} options={[{ key: 'all', label: t.all }, { key: 'in', label: t.moneyInShort }, { key: 'out', label: t.moneyOutShort }, { key: 'pending', label: t.status.pending }]} />
      <Panel><ActivityRows key={show} rows={rows} /></Panel>
    </Screen>
  );
}

/** Money that has actually landed, each line linked to its PayPal capture. */
export function Ledger() {
  const nav = useNav();
  const { paidIn, incoming, history } = useStore();
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.received} />}>
      <Panel style={a.big}>
        <T v="body" c={color.muted}>{t.moneyIn}</T>
        <T v="moneyL">{money(paidIn)}</T>
        <T v="small" c={color.muted}>{`$${(paidIn / DEMO_RATE).toFixed(2)} ${t.fromCustomers}`}</T>
      </Panel>
      {incoming > 0 && (
        <Panel style={a.line}>
          <T v="label">{t.status.pending}</T>
          <T v="label" c={color.amber}>{money(incoming)}</T>
        </Panel>
      )}
      <Panel>
        <Section title={t.paidInList} />
        <ActivityRows rows={history.filter(e => e.dir === 'in' && e.status === 'paid')} />
      </Panel>
      <Button kind="soft" label={t.backHome} onPress={() => nav.reset({ name: 'home' })} />
    </Screen>
  );
}

export function Speak() {
  const nav = useNav();
  const reduce = useReduceMotion();
  const [listening, setListening] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!listening) return;
    const loop = reduce ? null : Animated.loop(Animated.timing(pulse, { toValue: 1, duration: motion.pulse, easing: motion.ease.out, useNativeDriver: native }));
    loop?.start();
    const id = setTimeout(() => { setListening(false); nav.go({ name: 'proposal', amount: 1000 }); }, 2000);
    return () => { loop?.stop(); pulse.setValue(0); clearTimeout(id); };
  }, [listening, reduce]);
  return (
    <Screen tabsFor="speak" head={<CurvedHeader home title={t.speak} />}>
      <View style={a.speak}>
        <T v="hello" style={{ textAlign: 'center' }}>{listening ? t.listening : t.tapToTalk}</T>
        <T v="body" c={color.muted} style={{ textAlign: 'center' }}>{t.saySomething}</T>
        <View style={a.micWrap}>
          <Animated.View style={[a.ring, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={t.tapToTalk} onPress={() => setListening(true)} style={a.mic}>
            <Mic size={icon.xl} color={color.ink} strokeWidth={1.7} />
          </Pressable>
        </View>
        <Button kind="quiet" label={t.typeInstead} onPress={() => nav.go({ name: 'assist' })} />
      </View>
    </Screen>
  );
}

/** The assistant only proposes. A person says yes, and the normal screens do the rest. */
export function Proposal({ amount, offline }: { amount: number; offline?: boolean }) {
  const nav = useNav();
  const ask = offline ? t.collectAsk(amount) : t.proposalReply;
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={offline ? t.offlineHelp : t.speak} />}
      footer={<View style={a.yesNo}>
        <Button style={{ flex: 1 }} kind="soft" label={t.no} onPress={() => nav.back()} />
        <Button style={{ flex: 2 }} label={t.yes} onPress={() => nav.go({ name: 'request', amount })} />
      </View>}
    >
      <T v="hello">{ask}</T>
      <Panel style={a.big}>
        <T v="moneyL">{money(amount)}</T>
        {!offline && <T v="small" c={color.muted}>{`${t.youSaid}: ${t.proposalHeard}`}</T>}
      </Panel>
      <HearIt say={ask} />
      <T v="small" c={color.muted} style={{ textAlign: 'center' }}>{t.demo}</T>
    </Screen>
  );
}

/** With no network there is no AI, and this screen says so. Simple rules or a tap do the job. */
export function Assist() {
  const nav = useNav();
  const [text, setText] = useState('collect 1000');
  const amount = Number(text.replace(/\D/g, '').slice(0, 7));
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.offlineHelp} />}
      footer={<Button label={t.continue} disabled={!amount} onPress={() => nav.go({ name: 'proposal', amount, offline: true })} />}
    >
      <T v="hello">{t.whatToDo}</T>
      <T v="body" c={color.muted}>{t.noAiOffline}</T>
      <TextInput accessibilityLabel={t.typeIt} value={text} onChangeText={setText} style={a.input} placeholderTextColor={color.muted} />
      <Section title={t.orTap} />
      <View style={{ gap: space.sm }}>
        <Tap label={t.scan} onPress={() => nav.go({ name: 'scan' })} />
        <Tap label={t.collectShort} onPress={() => nav.go({ name: 'amount', mode: 'collect' })} />
        <Tap label={t.checkMoney} onPress={() => nav.reset({ name: 'home' })} />
      </View>
    </Screen>
  );
}

function Tap({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={a.setting}>
      <T v="label" style={{ flex: 1 }}>{label}</T>
      <ChevronRight size={icon.md} color={color.muted} strokeWidth={1.8} />
    </Press>
  );
}

export function SettingsScreen() {
  const nav = useNav();
  const { name } = useStore();
  const Row = ({ label, Icon, onPress }: { label: string; Icon: typeof Globe; onPress(): void }) => (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={a.setting}>
      <View style={a.rowIcon}><Icon size={icon.md} color={color.text} strokeWidth={1.7} /></View>
      <T v="label" style={{ flex: 1 }}>{label}</T>
      <ChevronRight size={icon.md} color={color.muted} strokeWidth={1.8} />
    </Press>
  );
  return (
    <Screen tabsFor="settings" head={<CurvedHeader home title={t.profile} />}>
      <Panel style={a.me}>
        <Avatar name={name} size={54} />
        <View style={{ flex: 1 }}>
          <T v="heading" numberOfLines={2}>{name}</T>
          <T v="small" c={color.muted}>{t.payAndCollect}</T>
        </View>
      </Panel>
      <View style={a.group}>
        <T v="smallStrong" c={color.muted}>{t.account}</T>
        <Row label={t.yourDetails} Icon={UserRound} onPress={() => nav.go({ name: 'details' })} />
        <Row label={t.changeLanguage} Icon={Globe} onPress={() => nav.go({ name: 'language' })} />
      </View>
      <View style={a.group}>
        <T v="smallStrong" c={color.muted}>{t.security}</T>
        <Row label={t.lockApp} Icon={Lock} onPress={() => nav.reset({ name: 'lock' })} />
        <View style={a.setting} accessible accessibilityLabel={`${t.phoneSecurity}, ${t.tierB}`}>
          <View style={a.rowIcon}><ShieldCheck size={icon.md} color={color.green} strokeWidth={1.7} /></View>
          <View style={{ flex: 1 }}>
            <T v="label">{t.phoneSecurity}</T>
            <T v="small" c={color.muted}>{t.tierB}</T>
          </View>
        </View>
      </View>
      <View style={a.group}>
        <T v="smallStrong" c={color.muted}>{t.support}</T>
        <Row label={t.help} Icon={HelpCircle} onPress={() => nav.go({ name: 'help' })} />
        <T v="small" c={color.muted} style={{ textAlign: 'center', paddingTop: space.sm }}>{t.buildNote}</T>
      </View>
    </Screen>
  );
}

const a = StyleSheet.create({
  speak: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },
  micWrap: { width: 176, height: 176, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.panel },
  ring: { position: 'absolute', width: 176, height: 176, borderRadius: radius.pill, borderWidth: 2, borderColor: color.blue },
  mic: { width: 124, height: 124, borderRadius: radius.pill, backgroundColor: color.text, alignItems: 'center', justifyContent: 'center' },
  me: { flexDirection: 'row', alignItems: 'center' },
  group: { gap: space.sm },
  big: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  yesNo: { flexDirection: 'row', gap: space.sm },
  input: { ...type.heading, color: color.text, height: touch.field, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.md },
  setting: { minHeight: touch.row, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.lg },
  rowIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: color.panelHigh, alignItems: 'center', justifyContent: 'center' },
});
