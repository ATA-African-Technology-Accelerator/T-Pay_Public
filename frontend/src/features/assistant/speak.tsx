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
import { interpretSpeech, interpretText, offlineAnswer, quickAnswer, rulesProposal, type Proposal } from './assistant';
import { useModelState } from '../settings/offlineAssistant';
import { salesStore } from '../business/businessStore';
import { helpAnswer, payHelp, payNeedsVault, type HelpAnswer } from './help';
import { AT_ONCE, NEEDS_AMOUNT, askAmountFor, askFirst, doNow, isDone, type ActionState } from './actions';

type Phase = 'idle' | 'listening' | 'thinking';
// Held at least this long, letting go ends the recording. Shorter is a tap: it starts listening, and
// a second tap (or silence) ends it.
const HOLD_MS = 350;

/**
 * `auto` is a hands-free start (Volume Up twice, or "Hey T-Pay"): it begins listening at once.
 * `heard` is a request already said after "Hey T-Pay", answered without listening again.
 * `followUp` is the assistant listening again after it answered ("What else?"): silence then just
 * ends the conversation, quietly, and "Hey T-Pay" starts a new one.
 */
export function Speak({ auto = false, attempt = 0, heard: alreadyHeard, followUp = false }: { auto?: boolean; attempt?: number; heard?: string; followUp?: boolean }) {
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
    if (startedByThisPress.current) void start(true);
  };
  const pressOut = () => {
    if (startedByThisPress.current && Date.now() - downAt.current >= HOLD_MS) speechIn.stop();
  };
  const press = () => {
    // A tap that just started listening keeps listening; a tap while listening stops it.
    if (startedByThisPress.current) { startedByThisPress.current = false; return; }
    if (phase === 'listening') speechIn.stop();
  };
  useEffect(() => {
    if (alreadyHeard) void answer(alreadyHeard);
    else if (auto) void start(false);
  }, []);

  const propose = (proposal: Proposal) => nav.go({ name: 'proposal', proposal, handsFree: true, attempt });

  // "That's all", "bye", "thanks": the conversation is over.
  const finished = async (text: string) => {
    if (!isDone(text)) return false;
    setPhase('idle');
    await speakNaturally(t.okayBye);
    nav.reset({ name: 'home' });
    return true;
  };

  const answer = async (text: string) => {
    setProblem(null);
    if (await finished(text)) return;
    setPhase('thinking');
    try {
      const reply = online ? await interpretText(text, language, offline.leftNgn) : await offlineAnswer(text, language, offline.leftNgn);
      setPhase('idle');
      propose(reply);
    } catch (e) {
      setPhase('idle');
      setProblem(apiMessage(e));
    }
  };

  // Hands free, nothing heard is asked again out loud, then the assistant goes quiet until it is
  // called again. It never asks the person to type. After an answer, silence just ends it.
  const heardNothing = async (byHand: boolean) => {
    setPhase('idle');
    if (byHand) { setProblem(t.heardNothing); return; }
    if (followUp) { nav.reset({ name: 'home' }); return; }
    if (attempt < RETRIES) {
      await speakNaturally(t.sayAgain);
      nav.reset({ name: 'speak', auto: true, attempt: attempt + 1 });
      return;
    }
    await speakNaturally(t.goingQuiet);
    nav.reset({ name: 'home' });
  };

  const start = async (byHand: boolean) => {
    if (phase === 'listening') { speechIn.stop(); return; }
    if (phase === 'thinking') return;
    setProblem(null);
    speechOut.stop();
    // A request the phone can read in full ends the listening a moment after it is said.
    // A bare "how do I…" is not finished yet: quickAnswer only counts a question with a topic.
    const complete = (heard: string) => isDone(heard) || quickAnswer(heard, language, offline.leftNgn) !== null;
    try {
      setPhase('listening');
      if (!online) {
        const heard = await speechIn.transcribeOffline(language, complete);
        if (heard === null) { setPhase('idle'); setProblem(t.noVoiceOffline); return; }
        if (!heard.text) { await heardNothing(byHand); return; }
        if (await finished(heard.text)) return;
        setPhase('thinking');
        const reply = await offlineAnswer(heard.text, language, offline.leftNgn);
        setPhase('idle');
        propose(reply);
        return;
      }
      // English and Pidgin: the phone writes the words down as they are said, and only text is sent.
      const live = await speechIn.transcribeLive(language, complete);
      if (live) {
        if (!live.text) { await heardNothing(byHand); return; }
        if (await finished(live.text)) return;
        setPhase('thinking');
        const reply = await interpretText(live.text, language, offline.leftNgn);
        setPhase('idle');
        propose(reply);
        return;
      }
      // Other languages: the recording goes to the assistant, which listens to it.
      const recorded = await speechIn.record();
      setPhase('thinking');
      const proposal = await interpretSpeech(recorded, language, offline.leftNgn);
      setPhase('idle');
      if (proposal) propose(proposal);
      else setProblem(t.notUnderstood);
    } catch (e) {
      setPhase('idle');
      if (e instanceof Error && e.message === 'NO_SPEECH') { await heardNothing(byHand); return; }
      setProblem(e instanceof Error && e.message === 'MICROPHONE_DENIED' ? t.micDenied : apiMessage(e));
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

/** What the screen shows (and, typed, says) before anything is done. The app's own words. */
function question(p: Proposal, s: ActionState): string {
  if (p.overCapacity) return t.overCapacity;
  if (NEEDS_AMOUNT.includes(p.intent) && p.amountNgnMinor === null) return askAmountFor(p.intent);
  const plan = askFirst(p, s);
  if (plan) return 'ask' in plan ? plan.ask : plan.say;
  switch (p.intent) {
    case 'RECORD_SALE': return p.itemName ? t.askSale(p.itemName, p.amountNgnMinor ? money(p.amountNgnMinor) : null) : t.askSaleNoItem(p.amountNgnMinor ? money(p.amountNgnMinor) : null);
    case 'UNKNOWN': return p.spokenReply ?? t.notUnderstood;
    default: return t.thinking;
  }
}

// Hands free, a misheard or unclear request is asked again this many times before the assistant
// goes quiet until it is called again.
const RETRIES = 1;
const UNCLEAR_RETRIES = 2;

/**
 * The assistant's answer. Anything that moves no money is done at once and said out loud; anything
 * that moves money is asked first, by voice, and then opens its screen, where the PIN, fingerprint
 * or PayPal sign-in is still the person's to give. Hands free, the conversation then carries on
 * ("What else?") until the person stops talking or says that's all.
 */
export function ProposalScreen({ proposal: first, handsFree = false, attempt = 0 }: { proposal: Proposal; handsFree?: boolean; attempt?: number }) {
  const nav = useNav();
  const { offline, language, active, online, name, history } = useApp();
  const [proposal, setProposal] = useState(first);
  const [hearing, setHearing] = useState(false);
  // Set once something was done at once, so the screen shows what was said.
  const [said, setSaid] = useState<string | null>(null);
  const state: ActionState = {
    vaultOpen: offline.open, canSpend: offline.canSpend, leftNgn: offline.leftNgn, spendBy: offline.spendBy,
    walletKnown: active.known, walletNgn: active.balanceNgn, online, name, history,
  };
  // A question about the app, or a payment with nothing to pay from, is answered with what to do
  // next and an offer to go there, instead of a dead end.
  const help = answerFor(proposal, state);
  const atOnce = !help && !proposal.overCapacity && AT_ONCE.includes(proposal.intent) && !(proposal.intent === 'SET_BUDGET' && !proposal.amountNgnMinor);
  const plan = help || atOnce ? null : askFirst(proposal, state);
  const ask = said ?? (help ? help.say : atOnce ? t.thinking : question(proposal, state));

  // A sale goes on the day's sales and, when the item is on the shelf, takes one off it.
  const recordSale = async (p: Proposal) => {
    const item = p.itemName?.trim() || null;
    const left = await salesStore.record(item, p.amountNgnMinor, new Date());
    return left ? t.saleRecorded(left.name, left.quantity) : item ? t.saleRecordedNotOnShelf(item) : t.saleRecordedPlain;
  };
  const go = async (p: Proposal) => {
    const next = askFirst(p, state);
    if (next && 'to' in next) { nav.go(next.to); return; }
    if (p.intent === 'CREATE_PAYMENT_REQUEST') { nav.go({ name: 'amount', mode: 'collect' }); return; }
    if (p.intent === 'PAY_AMOUNT') { nav.go({ name: 'scan', kind: 'request' }); return; }
    if (p.intent === 'RECORD_SALE') { const line = await recordSale(p); void speakNaturally(line); nav.reset({ name: 'stock' }); return; }
    nav.reset({ name: 'home' });
  };
  const yes = () => { if (help?.action) nav.go(help.action.route); else void go(proposal); };
  const actionable = !!plan && 'to' in plan || proposal.intent === 'RECORD_SALE' || (NEEDS_AMOUNT.includes(proposal.intent) && proposal.amountNgnMinor === null);

  useEffect(() => {
    let gone = false;
    const talk = async (line: string) => { if (!gone) await speakNaturally(line); return !gone; };
    // Keep the conversation going: listen for the next request.
    const more = () => { if (!gone) nav.reset({ name: 'speak', auto: true, followUp: true }); };
    const quiet = async () => { if (await talk(t.goingQuiet)) nav.reset({ name: 'home' }); };
    const listenYesNo = async (): Promise<'yes' | 'no' | null> => {
      setHearing(true);
      let answer = await speechIn.listenYesNo(language);
      if (!gone && answer === null) { await talk(t.sayYesOrNo); if (!gone) answer = await speechIn.listenYesNo(language); }
      if (!gone) setHearing(false);
      return answer;
    };
    // Asks a yes/no question; yes does `then`, no carries on with something else.
    const confirm = async (question: string, then: () => void | Promise<void>) => {
      if (question && !(await talk(question))) return;
      const answer = await listenYesNo();
      if (gone) return;
      if (answer === 'yes') await then();
      else if (answer === 'no') { if (await talk(`${t.okay} ${t.anythingElse}`)) more(); }
      // Nothing clear twice: the buttons are still there.
    };

    void (async () => {
      let p = proposal;

      // Done at once, typed or spoken: read a balance, open a screen, put stock on the shelf.
      if (atOnce) {
        const done = await doNow(p, state).catch(() => null);
        if (gone) return;
        if (!done) { if (handsFree) await quiet(); return; }
        setSaid(done.say);
        if (!(await talk(done.say))) return;
        if (done.to) { nav.reset(done.to); return; }
        if (handsFree && (await talk(t.anythingElse))) more();
        return;
      }

      if (!handsFree) { await talk(ask); return; }

      if (help) {
        if (!(await talk(help.say))) return;
        if (help.action) { await confirm('', () => nav.go(help.action!.route)); return; }
        // "What can you do" already ends with a question; anything else asks what's next.
        if (p.helpTopic !== 'WHAT_CAN_YOU_DO' && !(await talk(t.anythingElse))) return;
        more();
        return;
      }

      if (p.overCapacity) { if (await talk(`${t.overCapacity} ${t.anythingElse}`)) more(); return; }

      if (p.intent === 'UNKNOWN') {
        // Asked again out loud, never "tap or type"; after a couple of tries it goes quiet.
        if (attempt >= UNCLEAR_RETRIES) { await quiet(); return; }
        if (await talk(p.transcript.trim() ? t.tryLike : t.sayAgain)) nav.reset({ name: 'speak', auto: true, attempt: attempt + 1, followUp: true });
        return;
      }

      // A missing amount is asked for by voice, and asked once more if it wasn't caught.
      if (NEEDS_AMOUNT.includes(p.intent) && p.amountNgnMinor === null) {
        const hasAmount = (heard: string) => rulesProposal(heard, language).amountNgnMinor !== null;
        let amount: number | null = null;
        let heard: string | null = null;
        for (let tries = 0; tries < 2 && amount === null; tries += 1) {
          if (!(await talk(tries ? t.sayAgain : askAmountFor(p.intent)))) return;
          setHearing(true);
          heard = await speechIn.listenPhrase(language, hasAmount);
          if (gone) return;
          setHearing(false);
          if (heard && isDone(heard)) { if (await talk(t.okayBye)) nav.reset({ name: 'home' }); return; }
          amount = heard ? rulesProposal(heard, language).amountNgnMinor : null;
        }
        if (amount === null || !heard) { await quiet(); return; }
        p = { ...p, amountNgnMinor: amount, transcript: `${p.transcript} ${heard}`.trim(), spokenReply: null };
        setProposal(p);
        if (p.intent === 'SET_BUDGET') {
          const done = await doNow(p, state);
          if (gone || !done) return;
          setSaid(done.say);
          if (await talk(`${done.say} ${t.anythingElse}`)) more();
          return;
        }
      }

      if (p.intent === 'RECORD_SALE') {
        await confirm(question(p, state), async () => {
          const line = await recordSale(p);
          setSaid(line);
          if (await talk(`${line} ${t.anythingElse}`)) more();
        });
        return;
      }

      const next = askFirst(p, state);
      if (!next) { await quiet(); return; }
      // It can't be done ("your vault isn't open"): say why, and carry on.
      if ('say' in next) { setSaid(next.say); if (await talk(`${next.say} ${t.anythingElse}`)) more(); return; }
      await confirm(next.ask, () => nav.go(next.to));
    })();
    return () => { gone = true; speechOut.stop(); speechIn.stop(); };
  }, []);

  const footer = help
    ? help.action
      ? <View style={a.yesNo}>
        <Button style={{ flex: 1 }} kind="soft" label={t.notNow} onPress={() => nav.back()} />
        <Button style={{ flex: 2 }} label={help.action.label} onPress={yes} />
      </View>
      : <Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />
    : actionable && !said
      ? <View style={a.yesNo}>
        <Button style={{ flex: 1 }} kind="soft" label={t.no} onPress={() => nav.back()} />
        <Button style={{ flex: 2 }} label={t.yes} onPress={yes} />
      </View>
      : said || atOnce
        ? <Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />
        : <Button kind="soft" label={t.typeIt} onPress={() => nav.go({ name: 'assist' })} />;

  return (
    <Screen head={<CurvedHeader back bell={false} title={proposal.offline ? t.offlineHelp : t.speak} />} footer={footer}>
      <T v="hello" accessibilityLiveRegion="polite">{ask}</T>
      {!help && !said && proposal.amountNgnMinor !== null && proposal.intent !== 'CHECK_BALANCE' && (
        <Panel style={a.big}>
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(proposal.amountNgnMinor)}</T>
        </Panel>
      )}
      {hearing && <T v="label" c={color.muted} style={a.center} accessibilityLiveRegion="polite">{t.listening}</T>}
      {proposal.transcript ? <T v="small" c={color.muted}>{`${t.youSaid}: ${proposal.transcript}`}</T> : null}
      <HearIt say={!help && !said && proposal.amountNgnMinor ? `${ask} ${sayNaira(proposal.amountNgnMinor)}` : ask} />
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
        <Tap label={t.pay} onPress={() => nav.go(offline.canSpend ? { name: 'scan', kind: 'request' } : payHelp())} />
        <Tap label={t.receive} onPress={() => nav.go({ name: 'amount', mode: 'collect' })} />
        <Tap label={t.checkMoney} onPress={() => nav.reset({ name: 'home' })} />
      </View>
    </Screen>
  );
}

function answerFor(p: Proposal, s: Parameters<typeof helpAnswer>[1]): HelpAnswer | null {
  if (p.intent === 'HELP') return helpAnswer(p.helpTopic ?? 'WHAT_CAN_YOU_DO', s);
  // "Pay 2000" with no vault to pay from is refused as too much; say why, and offer to lock it.
  const payment = p.intent === 'PAY_AMOUNT' || (p.overCapacity && p.requestedNgnMinor !== undefined);
  if (payment && !s.canSpend) return payNeedsVault(p.amountNgnMinor ?? p.requestedNgnMinor ?? null, s);
  return null;
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
