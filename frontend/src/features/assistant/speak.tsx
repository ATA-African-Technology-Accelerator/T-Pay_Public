import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ChevronRight, Mic, Square } from 'lucide-react-native';
import { color, icon, motion, radius, space, touch, type } from '../../theme/tokens';
import { Button, HearIt, Panel, Press, T, money, native, sayNaira, speakNaturally, useReduceMotion } from '../../components/ui';
import { CurvedHeader, Screen, Section } from '../../components/shell';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import { api, localModel, speechIn, speechOut } from '../../composition';
import { apiMessage } from '../errors';
import { interpretSpeech, interpretText, offlineAnswer, rulesProposal, type Proposal } from './assistant';
import { useModelState } from '../settings/offlineAssistant';
import { salesStore } from '../business/businessStore';

type Phase = 'idle' | 'listening' | 'thinking';
// Held at least this long, letting go ends the recording. Shorter is a tap: it starts listening, and
// a second tap (or silence) ends it.
const HOLD_MS = 350;

/** `auto` is a volume-button start: it begins listening at once, hands free. */
export function Speak({ auto = false, attempt = 0 }: { auto?: boolean; attempt?: number }) {
  const nav = useNav();
  const reduce = useReduceMotion();
  const { language, offline, online } = useApp();
  const [phase, setPhase] = useState<Phase>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const model = useModelState();
  // Offline is when the phone's model is used, so load it while the person is still talking.
  // Online, wake the server while the person is still talking: after a quiet spell it can take
  // a long time to answer the first request.
  useEffect(() => { if (online) void api.warmUp(); else void localModel.warmUp(); }, [online]);

  useEffect(() => {
    if (phase !== 'listening' || reduce) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: motion.pulse, easing: motion.ease.out, useNativeDriver: native }));
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [phase, reduce]);
  useEffect(() => () => speechIn.stop(), []);
  // Press and hold: listening starts as the finger goes down and stops when it lifts.
  const downAt = useRef(0);
  const startedByThisPress = useRef(false);
  const pressIn = () => {
    downAt.current = Date.now();
    startedByThisPress.current = phase === 'idle';
    if (startedByThisPress.current) void start();
  };
  const pressOut = () => {
    if (startedByThisPress.current && Date.now() - downAt.current >= HOLD_MS) speechIn.stop();
  };
  const press = () => {
    // A tap that just started listening keeps listening; a tap while listening stops it.
    if (startedByThisPress.current) { startedByThisPress.current = false; return; }
    if (phase === 'listening') speechIn.stop();
  };
  useEffect(() => { if (auto) void start(); }, []);

  const offlinePath = async () => {
    setPhase('listening');
    const heard = await speechIn.transcribeOffline(language);
    setPhase('idle');
    if (heard) nav.go({ name: 'proposal', proposal: await offlineAnswer(heard, language, offline.leftNgn), handsFree: true, attempt });
    else nav.go({ name: 'assist' });
  };

  const start = async () => {
    if (phase === 'listening') { speechIn.stop(); return; }
    if (phase === 'thinking') return;
    setProblem(null);
    try {
      if (!online) { await offlinePath(); return; }
      setPhase('listening');
      // English: the phone writes down the words as they are said, and only text is sent.
      const live = await speechIn.transcribeLive(language);
      if (live) {
        if (!live.text) throw new Error('NO_SPEECH');
        setPhase('thinking');
        const answer = await interpretText(live.text, language, offline.leftNgn);
        setPhase('idle');
        nav.go({ name: 'proposal', proposal: answer, handsFree: true, attempt });
        return;
      }
      const recorded = await speechIn.record();
      setPhase('thinking');
      const proposal = await interpretSpeech(recorded, language, offline.leftNgn);
      setPhase('idle');
      if (proposal) nav.go({ name: 'proposal', proposal, handsFree: true, attempt });
      else await offlinePath();
    } catch (e) {
      setPhase('idle');
      setProblem(e instanceof Error && e.message === 'MICROPHONE_DENIED' ? t.micDenied : e instanceof Error && e.message === 'NO_SPEECH' ? t.heardNothing : apiMessage(e));
    }
  };

  const title = phase === 'listening' ? t.listening : phase === 'thinking' ? t.thinking : t.tapToTalk;
  return (
    <Screen tabsFor="speak" refreshable={false} head={<CurvedHeader home title={t.speak} />}>
      <View style={a.speak}>
        <T v="hello" style={a.center} accessibilityLiveRegion="polite">{title}</T>
        <T v="body" c={color.muted} style={a.center}>{phase === 'listening' ? t.tapToStop : online ? t.saySomething : model.kind === 'ready' ? t.aiOnPhone : t.noAiOffline}</T>
        <View style={a.micWrap}>
          <Animated.View style={[a.ring, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={phase === 'listening' ? t.tapToStop : t.tapToTalk} accessibilityState={{ busy: phase === 'thinking' }} accessibilityHint={t.talkHint} onPressIn={pressIn} onPressOut={pressOut} onPress={press} style={a.mic}>
            {phase === 'listening' ? <Square size={icon.lg} color={color.ink} strokeWidth={2} /> : <Mic size={icon.xl} color={color.ink} strokeWidth={1.7} />}
          </Pressable>
        </View>
        {problem && <T v="label" c={color.coral} style={a.center}>{problem}</T>}
        <Button kind="quiet" label={t.typeInstead} onPress={() => nav.go({ name: 'assist' })} />
        {!online && model.kind === 'absent' && (
          <Button kind="quiet" label={t.getOfflineAi} onPress={() => nav.go({ name: 'offlineAi' })} />
        )}
      </View>
    </Screen>
  );
}

function question(p: Proposal, leftNgn: number): string {
  if (p.spokenReply) return p.spokenReply;
  if (p.overCapacity) return t.overCapacity;
  switch (p.intent) {
    case 'CREATE_PAYMENT_REQUEST': return p.amountNgnMinor ? t.askCollect(money(p.amountNgnMinor)) : t.askAmount;
    case 'PAY_AMOUNT': return p.amountNgnMinor ? t.askPay(money(p.amountNgnMinor)) : t.askAmount;
    case 'CHECK_BALANCE': return t.askBalance(money(leftNgn));
    case 'RECORD_SALE': return p.itemName ? t.askSale(p.itemName, p.amountNgnMinor ? money(p.amountNgnMinor) : null) : t.askSaleNoItem(p.amountNgnMinor ? money(p.amountNgnMinor) : null);
    default: return t.notUnderstood;
  }
}

// Hands free, a misheard or unclear request is asked again this many times before the screen
// waits for a tap. More than that and the person is better served by the buttons.
const RETRIES = 1;

/** The assistant only proposes. A person says yes, and the normal screens do the rest. */
export function ProposalScreen({ proposal: first, handsFree = false, attempt = 0 }: { proposal: Proposal; handsFree?: boolean; attempt?: number }) {
  const nav = useNav();
  const { offline, language } = useApp();
  const [proposal, setProposal] = useState(first);
  const [hearing, setHearing] = useState(false);
  const ask = question(proposal, offline.leftNgn);

  const go = (p: Proposal) => {
    const amount = p.amountNgnMinor;
    if (p.intent === 'CREATE_PAYMENT_REQUEST') nav.go(amount ? { name: 'request', amount, handsFree } : { name: 'amount', mode: 'collect' });
    else if (p.intent === 'PAY_AMOUNT') nav.go({ name: 'scan', kind: 'request', expected: amount ?? undefined, handsFree });
    else if (p.intent === 'RECORD_SALE') void recordSale(p);
    else nav.reset({ name: 'home' });
  };
  // A sale goes on the day's sales and, when the item is on the shelf, takes one off it. The backend's
  // assistant (or the phone's own model offline) names the item; the shelf itself stays on the phone.
  const recordSale = async (p: Proposal) => {
    const item = p.itemName?.trim() || null;
    const left = await salesStore.record(item, p.amountNgnMinor, new Date());
    const said = left ? t.saleRecorded(left.name, left.quantity) : item ? t.saleRecordedNotOnShelf(item) : t.saleRecordedPlain;
    void speakNaturally(said);
    nav.reset({ name: 'stock' });
  };
  const yes = () => go(proposal);
  const actionable = proposal.intent === 'CREATE_PAYMENT_REQUEST' || proposal.intent === 'PAY_AMOUNT' || proposal.intent === 'CHECK_BALANCE' || proposal.intent === 'RECORD_SALE';

  // Hands free, the whole exchange is spoken: the question is read, and the person answers by voice.
  // A missing amount is asked for, a balance is just read out, and a misheard answer is asked once
  // more. A spoken yes only confirms what was heard: paying still needs the hold on the payment screen.
  useEffect(() => {
    let gone = false;
    const listenYesNo = async (): Promise<'yes' | 'no' | null> => {
      setHearing(true);
      const answer = await speechIn.listenYesNo(language);
      if (!gone) setHearing(false);
      return answer;
    };
    void (async () => {
      let p = proposal;
      await speakNaturally(question(p, offline.leftNgn));
      if (gone || !handsFree) return;

      if (p.intent === 'CHECK_BALANCE') { nav.reset({ name: 'home' }); return; }

      const wantsAmount = (p.intent === 'CREATE_PAYMENT_REQUEST' || p.intent === 'PAY_AMOUNT') && p.amountNgnMinor === null;
      if (wantsAmount) {
        setHearing(true);
        const said = await speechIn.listenPhrase(language);
        if (gone) return;
        setHearing(false);
        const amount = said ? rulesProposal(said, language).amountNgnMinor : null;
        if (amount === null) return; // the buttons are still there
        p = { ...p, amountNgnMinor: amount, transcript: `${p.transcript} ${said}`.trim(), spokenReply: null };
        setProposal(p);
        await speakNaturally(question(p, offline.leftNgn));
        if (gone) return;
      } else if (!actionable || p.overCapacity) {
        // Not understood: listen again from the start, once.
        if (attempt < RETRIES) nav.reset({ name: 'speak', auto: true, attempt: attempt + 1 });
        return;
      }

      let answer = await listenYesNo();
      if (gone) return;
      if (answer === null) {
        await speakNaturally(t.sayYesOrNo);
        if (gone) return;
        answer = await listenYesNo();
        if (gone) return;
      }
      if (answer === 'yes') go(p); else if (answer === 'no') nav.back();
    })();
    return () => { gone = true; speechOut.stop(); speechIn.stop(); };
  }, []);

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
      {hearing && <T v="label" c={color.muted} style={a.center} accessibilityLiveRegion="polite">{t.sayYesOrNo}</T>}
      {proposal.transcript ? <T v="small" c={color.muted}>{`${t.youSaid}: ${proposal.transcript}`}</T> : null}
      <HearIt say={proposal.amountNgnMinor ? `${ask} ${sayNaira(proposal.amountNgnMinor)}` : ask} />
      {proposal.offline && <T v="small" c={color.muted} style={a.center}>{proposal.onDevice ? t.aiOnPhone : t.noAiOffline}</T>}
    </Screen>
  );
}

/** Typing works everywhere, and the taps work with no network and no AI (FR-31). */
export function Assist() {
  const nav = useNav();
  const { language, offline, online } = useApp();
  const model = useModelState();
  useEffect(() => { if (online) void api.warmUp(); else void localModel.warmUp(); }, [online]);
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
      head={<CurvedHeader back bell={false} title={online ? t.speak : t.offlineHelp} />}
      footer={<Button label={t.continue} disabled={!text.trim()} loading={busy} onPress={() => { void go(); }} />}
    >
      <T v="hello">{t.whatToDo}</T>
      <T v="small" c={color.muted}>{online ? t.aiOnline : model.kind === 'ready' ? t.aiOnPhone : t.noAiOffline}</T>
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
