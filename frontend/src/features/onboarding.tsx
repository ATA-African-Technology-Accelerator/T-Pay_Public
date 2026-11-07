import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AlertCircle, Check, ShieldCheck, Volume2 } from 'lucide-react-native';
import { color, glass, icon, motion, radius, space, touch, type } from '../theme/tokens';
import { Aurora } from '../components/aurora';
import { Button, Panel, Rise, T, native, speak, useReduceMotion } from '../components/ui';
import { BagIcon } from '../components/icons';
import { CurvedHeader, Screen } from '../components/shell';
import { useNav } from '../nav';
import { useStore } from '../demo/store';
import { languageCodes, languages, t } from '../i18n/en';
import { ApiRequestError } from '../adapters/api/httpApi';
import { softwareOnly } from '../adapters/crypto/deviceSigner';
import { api, keyStore, signer } from '../composition';
import { config } from '../config';
import { registerDevice } from '../session/registerDevice';

export function Splash() {
  const nav = useNav();
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: motion.slow, useNativeDriver: native }).start();
    const id = setTimeout(() => nav.reset({ name: 'language' }), 1500);
    return () => clearTimeout(id);
  }, []);
  return (
    <View style={o.splash}>
      <Aurora />
      <Animated.View style={[o.mark, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
        <View style={o.logo}><BagIcon size={44} c={color.white} w={1.5} /></View>
        <T style={o.brand}>T-Pay</T>
        <T v="heading" c={color.white}>{t.tagline}</T>
      </Animated.View>
    </View>
  );
}

export function Language() {
  const nav = useNav();
  const { setLanguage } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Screen head={<CurvedHeader bell={false} title={t.chooseLanguage} />}>
      <View style={{ gap: space.sm }}>
        {languages.map((name, i) => {
          const on = picked === name;
          return (
            <Rise key={name} delay={i * motion.stagger} style={o.langRow}>
              <Pressable
                accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={name}
                onPress={() => { setPicked(name); setLanguage(languageCodes[i]); setTimeout(() => nav.go({ name: 'details' }), 180); }}
                style={[o.lang, on && { backgroundColor: color.panelHigh }]}
              >
                <T v="heading">{name}</T>
                {on && <Check size={icon.md} color={color.blue} strokeWidth={2.4} />}
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Hear ${name}`} onPress={() => speak(name)} style={o.ear}>
                <Volume2 size={icon.md} color={color.text} strokeWidth={1.8} />
              </Pressable>
            </Rise>
          );
        })}
      </View>
    </Screen>
  );
}

/** One account for everyone: your name for customers, and where received money goes. */
export function Details() {
  const nav = useNav();
  const { name, setName, payout, setPayout, language } = useStore();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const finish = async () => {
    if (config.sampleOnly) { nav.reset({ name: 'lock' }); return; }
    setBusy(true); setProblem(null);
    try {
      await registerDevice({ displayName: name, language, payoutEmail: payout }, { api, signer, keyStore, rootPublicKey: config.rootPublicKey });
      nav.reset({ name: 'lock' });
    } catch (e) {
      setProblem(setupMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.yourDetails} />}
      footer={<Button label={busy ? t.settingUp : t.finish} loading={busy} disabled={!name.trim() || !payout.trim()} onPress={finish} />}
    >
      <View style={o.field}>
        <T v="label">{t.yourName}</T>
        <TextInput accessibilityLabel={t.yourName} value={name} onChangeText={setName} editable={!busy} maxLength={80} style={o.input} />
        <T v="small" c={color.muted}>{t.nameHint}</T>
      </View>
      <View style={o.field}>
        <T v="label">{t.payoutEmail}</T>
        <TextInput accessibilityLabel={t.payoutEmail} value={payout} onChangeText={setPayout} editable={!busy} autoCapitalize="none" keyboardType="email-address" style={o.input} />
        <T v="small" c={color.muted}>{t.payoutHint}</T>
      </View>
      {problem && (
        <Panel style={o.note}>
          <AlertCircle size={icon.md} color={color.coral} strokeWidth={1.8} />
          <T v="body" style={{ flex: 1 }} accessibilityLiveRegion="assertive" accessibilityRole="alert">{problem}</T>
        </Panel>
      )}
      <Panel style={o.note}>
        <ShieldCheck size={icon.md} color={color.green} strokeWidth={1.7} />
        <View style={{ flex: 1 }}>
          <T v="label">{softwareOnly ? t.tierB : t.tierBHardware}</T>
          <T v="small" c={color.muted}>{t.needsInternetOnce}</T>
        </View>
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
  splash: { flex: 1, backgroundColor: color.page, alignItems: 'center', justifyContent: 'center' },
  mark: { alignItems: 'center', gap: space.xs },
  logo: { width: 88, height: 88, borderRadius: radius.pill, borderWidth: 1, borderColor: glass.line, backgroundColor: glass.fill, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  brand: { ...type.moneyL, color: color.white },
  langRow: { flexDirection: 'row', gap: space.sm },
  lang: { flex: 1, minHeight: touch.row, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: color.panel, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ear: { width: touch.row, height: touch.row, borderRadius: radius.md, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  field: { gap: space.xs },
  input: { ...type.heading, color: color.text, height: touch.field, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.md },
  note: { flexDirection: 'row', alignItems: 'center' },
});
