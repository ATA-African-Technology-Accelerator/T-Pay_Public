import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AlertCircle, Check, Volume2, Wifi } from 'lucide-react-native';
import { color, glass, icon, motion, radius, space, touch, type } from '../../theme/tokens';
import { Button, Panel, Rise, T, native, speak, useReduceMotion } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { useNav } from '../../nav';
import { useApp, type AccountKind } from '../../state/appState';
import { languageCodes, languages, t } from '../../i18n';
import { ApiRequestError } from '../../adapters/api/httpApi';
import { api, appLock, keyStore, signer } from '../../composition';
import { config } from '../../config';
import { registerDevice } from '../../session/registerDevice';
import { profileStore } from '../../session/profileStore';
import { sessionStore } from '../../session/sessionStore';
import { withSession } from '../../session/guard';

const EMBLEM = require('../../../assets/brand/splash-emblem.png');
const WORDMARK = require('../../../assets/brand/splash-wordmark.png');

// The full logo is 2400 x 2208; on screen it is 300 wide. The emblem and the wordmark are cut from
// it, so these place them back exactly where they sit in the logo.
const LOGO_W = 300;
const K = LOGO_W / 2400;
const LOGO_H = 2208 * K;
const EMBLEM_BOX = { left: 700 * K, top: 275 * K, width: 1000 * K, height: 1000 * K };
const WORDMARK_BOX = { left: 560 * K, top: 1450 * K, width: 1280 * K, height: 530 * K };
// How far the emblem starts below its place in the logo, so it begins in the middle of the screen,
// right where Android's own splash showed it.
const RISE = LOGO_H / 2 - (EMBLEM_BOX.top + EMBLEM_BOX.height / 2);
// The opening: the circled T alone, then the screen fills with blue, then the T rises as the name
// and tagline appear. Long enough to land, short enough not to keep anyone waiting.
const HOLD_MS = 250;
const BLUE_MS = 500;
const REVEAL_MS = 550;
const OPEN_DONE_MS = HOLD_MS + BLUE_MS + REVEAL_MS + 300;

/** ACT-01. A phone with a PIN and an identity unlocks; anything less finishes setup. */
export function Splash() {
  const nav = useNav();
  const reduce = useReduceMotion();
  const blue = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const reveal = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (!reduce) {
      Animated.sequence([
        Animated.delay(HOLD_MS),
        Animated.timing(blue, { toValue: 1, duration: BLUE_MS, easing: motion.ease.inOut, useNativeDriver: false }),
      ]).start();
      Animated.sequence([
        Animated.delay(HOLD_MS + BLUE_MS * 0.6),
        Animated.timing(reveal, { toValue: 1, duration: REVEAL_MS, easing: motion.ease.out, useNativeDriver: native }),
      ]).start();
    }
    let cancelled = false;
    const known = Promise.all([appLock.hasPin().catch(() => false), sessionStore.load().catch(() => null)]);
    const id = setTimeout(async () => {
      const [pin, session] = await known;
      if (cancelled) return;
      nav.reset({ name: session ? (pin ? 'lock' : 'createPin') : 'language' });
    }, reduce ? 900 : OPEN_DONE_MS);
    return () => { cancelled = true; clearTimeout(id); };
  }, []);
  const background = blue.interpolate({ inputRange: [0, 1], outputRange: [color.night, color.brand] });
  return (
    <Animated.View style={[o.splash, { backgroundColor: background }]} accessible accessibilityRole="image" accessibilityLabel={`T-Pay. ${t.tagline}`}>
      <View style={o.logoBox}>
        <Animated.Image source={EMBLEM} resizeMode="contain" style={[o.part, EMBLEM_BOX, { transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }] }]} />
        <Animated.Image source={WORDMARK} resizeMode="contain" style={[o.part, WORDMARK_BOX, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]} />
      </View>
    </Animated.View>
  );
}

const OFFERED = ['en', 'pcm'];

export function Language({ edit: asked }: { edit?: boolean }) {
  const nav = useNav();
  const { setLanguage, language, session } = useApp();
  // A phone that already has an account only ever edits it. Setup would register it again.
  const edit = asked || !!session;
  const [picked, setPicked] = useState<string | null>(edit ? languages[languageCodes.indexOf(language)] ?? null : null);
  // Sign-up offers English and Nigerian Pidgin only. The other catalogues stay, so a phone already
  // set to one of them still shows it when the language is changed later.
  const shown = languageCodes.map((code, i) => i).filter(i => OFFERED.includes(languageCodes[i] as string) || (edit && languageCodes[i] === language));
  const choose = (i: number) => {
    setPicked(languages[i] as string);
    void setLanguage(languageCodes[i] as (typeof languageCodes)[number]);
    setTimeout(() => (edit ? nav.back() : nav.go({ name: 'details' })), 180);
  };
  return (
    <Screen head={<CurvedHeader back={edit} bell={false} title={t.chooseLanguage} />}>
      <View style={{ gap: space.sm }}>
        {shown.map(i => {
          const name = languages[i] as string;
          const on = picked === name;
          return (
            <Rise key={name} delay={shown.indexOf(i) * motion.stagger} style={o.langRow}>
              <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={name} onPress={() => choose(i)} style={[o.lang, on && { backgroundColor: color.panelHigh }]}>
                <T v="heading">{name}</T>
                {on && <Check size={icon.md} color={color.blue} strokeWidth={2.4} />}
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${t.hearIt}: ${name}`} onPress={() => speak(name)} style={o.ear}>
                <Volume2 size={icon.md} color={color.text} strokeWidth={1.8} />
              </Pressable>
            </Rise>
          );
        })}
      </View>
    </Screen>
  );
}

/**
 * ACT-02, and ACT-16 when editing. One account for everyone: the name customers see
 * and the PayPal email collected money goes to. Editing re-registers the same key, so
 * the certificate other phones check carries the new name.
 */
export function Details({ edit: asked }: { edit?: boolean }) {
  const nav = useNav();
  const { draft, setDraft, profile, language, accountKind, setAccountKind, session } = useApp();
  // A phone that already has an account only ever edits it. Setup would register it again.
  const edit = asked || !!session;
  const [kind, setKind] = useState<AccountKind>(edit ? accountKind : 'personal');
  const [name, setName] = useState(edit ? profile?.displayName ?? '' : draft.displayName);
  const [payout, setPayout] = useState(edit ? profile?.payoutEmail ?? '' : draft.payoutEmail);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The server may be waking up. Say so, instead of leaving a spinner that looks stuck.
  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const id = setTimeout(() => setSlow(true), 8_000);
    return () => clearTimeout(id);
  }, [busy]);

  const finish = async () => {
    setBusy(true); setProblem(null);
    const details = { displayName: name.trim(), language, payoutEmail: payout.trim() };
    try {
      if (edit) {
        await withSession(() => api.updateProfile({ displayName: details.displayName, payoutEmail: details.payoutEmail }));
      } else {
        setDraft({ displayName: details.displayName, payoutEmail: details.payoutEmail });
      }
      await registerDevice(details, { api, signer, keyStore, rootPublicKey: config.rootPublicKey });
      await profileStore.save(details);
      await setAccountKind(kind);
      if (edit) nav.back(); else nav.reset({ name: 'createPin' });
    } catch (e) {
      setProblem(setupMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.yourDetails} />}
      footer={<Button label={busy ? (edit ? t.saving : t.settingUp) : edit ? t.done : t.finish} loading={busy} disabled={!name.trim() || !payout.trim()} onPress={() => { void finish(); }} />}
    >
      <View style={o.field}>
        <T v="label">{t.yourName}</T>
        <TextInput accessibilityLabel={t.yourName} value={name} onChangeText={setName} editable={!busy} maxLength={80} style={o.input} />
        <T v="small" c={color.muted}>{t.nameHint}</T>
      </View>
      <View style={o.field}>
        <T v="label">{t.payoutEmail}</T>
        <TextInput accessibilityLabel={t.payoutEmail} value={payout} onChangeText={setPayout} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={o.input} />
        <T v="small" c={color.muted}>{t.payoutHint}</T>
      </View>
      <View style={o.field}>
        <T v="label">{t.accountTypeTitle}</T>
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
          {([['personal', t.accountPersonal, t.accountPersonalHint], ['business', t.accountBusiness, t.accountBusinessHint]] as const).map(([value, title, hint]) => {
            const on = kind === value;
            return (
              <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${title}. ${hint}`} disabled={busy} onPress={() => setKind(value)} style={[o.kind, on && { backgroundColor: color.panelHigh, borderColor: color.blue }]}>
                <View style={{ flex: 1 }}>
                  <T v="heading">{title}</T>
                  <T v="small" c={color.muted}>{hint}</T>
                </View>
                {on && <Check size={icon.md} color={color.blue} strokeWidth={2.4} />}
              </Pressable>
            );
          })}
        </View>
      </View>
      {busy && slow && (
        <Panel style={o.note}>
          <Wifi size={icon.md} color={color.icon} strokeWidth={1.7} />
          <T v="small" style={{ flex: 1 }} accessibilityLiveRegion="polite">{t.wakingUp}</T>
        </Panel>
      )}
      {problem && (
        <Panel style={o.note}>
          <AlertCircle size={icon.md} color={color.coral} strokeWidth={1.8} />
          <T v="body" style={{ flex: 1 }} accessibilityLiveRegion="assertive" accessibilityRole="alert">{problem}</T>
        </Panel>
      )}
      <Panel style={o.note}>
        <Wifi size={icon.md} color={color.blue} strokeWidth={1.7} />
        <T v="small" c={color.muted} style={{ flex: 1 }}>{t.needsInternetOnce}</T>
      </Panel>
    </Screen>
  );
}

function setupMessage(e: unknown): string {
  const code = e instanceof ApiRequestError ? e.code : null;
  if (code === 'NETWORK' || code === 'PAYPAL_UNAVAILABLE') return t.setupNoInternet;
  if (code === 'VALIDATION_FAILED') return t.setupCheckDetails;
  if (code === 'RATE_LIMITED') return t.setupBusy;
  return t.setupFailed;
}

const o = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoBox: { width: LOGO_W, height: LOGO_H },
  part: { position: 'absolute' },
  langRow: { flexDirection: 'row', gap: space.sm },
  lang: { flex: 1, minHeight: touch.row, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: color.panel, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ear: { width: touch.row, height: touch.row, borderRadius: radius.md, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  field: { gap: space.xs },
  input: { ...type.heading, color: color.text, height: touch.field, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.md },
  note: { flexDirection: 'row', alignItems: 'center' },
  kind: { minHeight: touch.row, padding: space.lg, gap: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent', backgroundColor: color.panel, flexDirection: 'row', alignItems: 'center' },
});
