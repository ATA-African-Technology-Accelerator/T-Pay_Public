import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ChevronRight, Mic, Square } from 'lucide-react-native';
import { color, icon, motion, radius, space, touch, type } from '../../theme/tokens';
import { Button, HearIt, Panel, Press, T, money, native, sayNaira, speak, useReduceMotion } from '../../components/ui';
import { CurvedHeader, Screen, Section } from '../../components/shell';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import { speechIn } from '../../composition';
import { apiMessage } from '../errors';
import { interpretSpeech, interpretText, offlineProposal, type Proposal } from './assistant';

type Phase = 'idle' | 'listening' | 'thinking';

export function Speak() {
  const nav = useNav();
  const reduce = useReduceMotion();
  const { language, offline, online } = useApp();
  const [phase, setPhase] = useState<Phase>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase !== 'listening' || reduce) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: motion.pulse, easing: motion.ease.out, useNativeDriver: native }));
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [phase, reduce]);
  useEffect(() => () => speechIn.stop(), []);

  const offlinePath = async () => {
    setPhase('listening');
    const heard = await speechIn.transcribeOffline(language);
    setPhase('idle');
    if (heard) nav.go({ name: 'proposal', proposal: offlineProposal(heard, language) });
    else nav.go({ name: 'assist' });
  };

  const start = async () => {
    if (phase === 'listening') { speechIn.stop(); return; }
    if (phase === 'thinking') return;
    setProblem(null);
    try {
      if (!online) { await offlinePath(); return; }
      setPhase('listening');
      const recorded = await speechIn.record();
      setPhase('thinking');
      const proposal = await interpretSpeech(recorded, language, offline.leftNgn);
      setPhase('idle');
      if (proposal) nav.go({ name: 'proposal', proposal });
      else await offlinePath();
    } catch (e) {
      setPhase('idle');
      setProblem(e instanceof Error && e.message === 'MICROPHONE_DENIED' ? t.micDenied : apiMessage(e));
    }
  };

  const title = phase === 'listening' ? t.listening : phase === 'thinking' ? t.thinking : t.tapToTalk;
  return (
    <Screen tabsFor="speak" head={<CurvedHeader home title={t.speak} />}>
      <View style={a.speak}>
        <T v="hello" style={a.center} accessibilityLiveRegion="polite">{title}</T>
        <T v="body" c={color.muted} style={a.center}>{phase === 'listening' ? t.tapToStop : online ? t.saySomething : t.noAiOffline}</T>
        <View style={a.micWrap}>
          <Animated.View style={[a.ring, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={phase === 'listening' ? t.tapToStop : t.tapToTalk} accessibilityState={{ busy: phase === 'thinking' }} onPress={() => { void start(); }} style={a.mic}>
            {phase === 'listening' ? <Square size={icon.lg} color={color.ink} strokeWidth={2} /> : <Mic size={icon.xl} color={color.ink} strokeWidth={1.7} />}
          </Pressable>
        </View>
        {problem && <T v="label" c={color.coral} style={a.center}>{problem}</T>}
        <Button kind="quiet" label={t.typeInstead} onPress={() => nav.go({ name: 'assist' })} />
      </View>
    </Screen>
  );
}

function question(p: Proposal, leftNgn: number): string {
  if (p.spokenReply) return p.spokenReply;
  switch (p.intent) {
    case 'CREATE_PAYMENT_REQUEST': return p.amountNgnMinor ? t.askCollect(money(p.amountNgnMinor)) : t.askAmount;
    case 'PAY_AMOUNT': return p.amountNgnMinor ? t.askPay(money(p.amountNgnMinor)) : t.askAmount;
    case 'CHECK_BALANCE': return t.askBalance(money(leftNgn));
    case 'RECORD_SALE': return t.salesLater;
    default: return t.notUnderstood;
  }
}

/** The assistant only proposes. A person says yes, and the normal screens do the rest. */
export function ProposalScreen({ proposal }: { proposal: Proposal }) {
  const nav = useNav();
  const { offline } = useApp();
  const ask = question(proposal, offline.leftNgn);
  useEffect(() => { speak(ask); }, []);

  const yes = () => {
    const amount = proposal.amountNgnMinor;
    if (proposal.intent === 'CREATE_PAYMENT_REQUEST') nav.go(amount ? { name: 'request', amount } : { name: 'amount', mode: 'collect' });
    else if (proposal.intent === 'PAY_AMOUNT') nav.go({ name: 'scan', kind: 'request', expected: amount ?? undefined });
    else nav.reset({ name: 'home' });
  };
  const actionable = proposal.intent === 'CREATE_PAYMENT_REQUEST' || proposal.intent === 'PAY_AMOUNT' || proposal.intent === 'CHECK_BALANCE';

  return (
    <Screen
      head={<CurvedHeader back bell={false} title={proposal.offline ? t.offlineHelp : t.speak} />}
      footer={actionable
        ? <View style={a.yesNo}>
          <Button style={{ flex: 1 }} kind="soft" label={t.no} onPress={() => nav.back()} />
          <Button style={{ flex: 2 }} label={t.yes} onPress={yes} />
        </View>
        : <Button label={t.typeIt} onPress={() => nav.go({ name: 'assist' })} />}
    >
      <T v="hello">{ask}</T>
      {proposal.amountNgnMinor !== null && proposal.intent !== 'CHECK_BALANCE' && (
        <Panel style={a.big}>
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(proposal.amountNgnMinor)}</T>
        </Panel>
      )}
      {proposal.transcript ? <T v="small" c={color.muted}>{`${t.youSaid}: ${proposal.transcript}`}</T> : null}
      <HearIt say={proposal.amountNgnMinor ? `${ask} ${sayNaira(proposal.amountNgnMinor)}` : ask} />
      {proposal.offline && <T v="small" c={color.muted} style={a.center}>{t.noAiOffline}</T>}
    </Screen>
  );
}

/** Typing works everywhere, and the taps work with no network and no AI (FR-31). */
export function Assist() {
  const nav = useNav();
  const { language, offline } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setProblem(null);
    try { nav.go({ name: 'proposal', proposal: await interpretText(text.trim(), language, offline.leftNgn) }); }
    catch (e) { setProblem(apiMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.offlineHelp} />}
      footer={<Button label={t.continue} disabled={!text.trim()} loading={busy} onPress={() => { void go(); }} />}
    >
      <T v="hello">{t.whatToDo}</T>
      <TextInput accessibilityLabel={t.typeIt} placeholder={t.typeIt} value={text} onChangeText={setText} style={a.input} placeholderTextColor={color.muted} maxLength={500} />
      {problem && <T v="label" c={color.coral}>{problem}</T>}
      <Section title={t.orTap} />
      <View style={{ gap: space.sm }}>
        {offline.canSpend && <Tap label={t.pay} onPress={() => nav.go({ name: 'scan', kind: 'request' })} />}
        <Tap label={t.receive} onPress={() => nav.go({ name: 'amount', mode: 'collect' })} />
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

const a = StyleSheet.create({
  speak: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },
  center: { textAlign: 'center' },
  micWrap: { width: 176, height: 176, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.panel },
  ring: { position: 'absolute', width: 176, height: 176, borderRadius: radius.pill, borderWidth: 2, borderColor: color.blue },
  mic: { width: 124, height: 124, borderRadius: radius.pill, backgroundColor: color.text, alignItems: 'center', justifyContent: 'center' },
  big: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  yesNo: { flexDirection: 'row', gap: space.sm },
  input: { ...type.heading, color: color.text, height: touch.field, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.md },
  setting: { minHeight: touch.row, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.lg },
});
