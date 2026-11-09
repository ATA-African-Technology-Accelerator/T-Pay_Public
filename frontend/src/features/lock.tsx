import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { color, glass, icon, radius, space, touch } from '../theme/tokens';
import { Press, T } from '../components/ui';
import { Aurora } from '../components/aurora';
import { Keypad } from '../components/keypad';
import { inset } from '../components/shell';
import { useNav } from '../nav';
import { useStore } from '../demo/store';
import { appLock, biometrics } from '../composition';
import { sessionStore } from '../session/sessionStore';
import { t } from '../i18n/en';

const LENGTH = 4;
const SECOND = 1000;

/** Set up during onboarding: pick a PIN, then type it again to confirm. */
export function CreatePin() {
  const nav = useNav();
  const [first, setFirst] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = async (pin: string) => {
    if (first === null) { setFirst(pin); setNote(null); return true; }
    if (pin !== first) { setFirst(null); setNote(t.pinMismatch); return true; }
    setBusy(true);
    const saved = await appLock.setPin(pin);
    setBusy(false);
    if (saved.isSuccess) { nav.reset({ name: 'home' }); return false; }
    setFirst(null); setNote(t.pinMismatch);
    return true;
  };

  return (
    <PinPad
      eyebrow={t.almostDone}
      title={first === null ? t.createPin : t.confirmPin}
      hint={first === null ? t.createPinHint : undefined}
      note={note}
      disabled={busy}
      onComplete={complete}
    />
  );
}

/** Opens the app: fingerprint first if the phone has it, the PIN always works. */
export function Lock() {
  const nav = useNav();
  const store = useStore();
  const [name, setName] = useState(store.name);
  const [fingerprint, setFingerprint] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const asked = useRef(false);

  const open = () => nav.reset({ name: 'home' });

  const tryFingerprint = async () => {
    const result = await appLock.unlockWithBiometrics();
    if (result.status === 'UNLOCKED') open();
    else if (result.status === 'NO_PIN') nav.reset({ name: 'createPin' });
    else setNote(t.fingerprintFailed);
  };

  useEffect(() => {
    sessionStore.load().then(s => { if (s) setName(s.deviceCertificate.payload.displayName); }).catch(() => {});
    biometrics.isAvailable().then(ok => {
      setFingerprint(ok);
      // Offer it once on arrival, like a bank app. Never loop the prompt.
      if (ok && !asked.current) { asked.current = true; tryFingerprint(); }
    });
  }, []);

  // Count down a lockout so people can see when to try again.
  useEffect(() => {
    if (retryAt === null) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= retryAt) { setRetryAt(null); setNote(null); }
    }, SECOND);
    return () => clearInterval(id);
  }, [retryAt]);

  const lockedFor = retryAt === null ? 0 : Math.max(1, Math.ceil((retryAt - now) / SECOND));

  const complete = async (pin: string) => {
    const result = await appLock.unlockWithPin(pin);
    switch (result.status) {
      case 'UNLOCKED': open(); return false;
      case 'NO_PIN': nav.reset({ name: 'createPin' }); return false;
      case 'WRONG_PIN': setNote(t.wrongPin(result.attemptsLeft)); return true;
      case 'LOCKED_OUT': setRetryAt(new Date(result.retryAt).getTime()); setNow(Date.now()); return true;
      default: return true;
    }
  };

  return (
    <PinPad
      eyebrow={t.welcome}
      heading={name}
      title={t.enterPin}
      note={retryAt !== null ? t.lockedOut(lockedFor) : note}
      disabled={retryAt !== null}
      onComplete={complete}
      footer={fingerprint ? (
        <Press accessibilityRole="button" accessibilityLabel={t.useFingerprint} disabled={retryAt !== null} onPress={tryFingerprint} style={l.finger}>
          <Fingerprint size={icon.md} color={color.blue} strokeWidth={1.8} />
          <T v="label">{t.useFingerprint}</T>
        </Press>
      ) : null}
    />
  );
}

type PadProps = {
  eyebrow: string; heading?: string; title: string; hint?: string; note: string | null; disabled?: boolean;
  /** Called with all four digits. Return true to clear the dots for another go. */
  onComplete(pin: string): Promise<boolean>;
  footer?: React.ReactNode;
};

function PinPad({ eyebrow, heading, title, hint, note, disabled, onComplete, footer }: PadProps) {
  const [pin, setPin] = useState('');
  const checking = useRef(false);

  useEffect(() => {
    if (pin.length !== LENGTH || checking.current) return;
    checking.current = true;
    onComplete(pin)
      .then(clear => { if (clear) setPin(''); })
      .catch(() => setPin(''))
      .finally(() => { checking.current = false; });
  }, [pin]);

  const press = (k: string) => {
    if (disabled || checking.current) return;
    setPin(p => (k === 'del' ? p.slice(0, -1) : (p + k).slice(0, LENGTH)));
  };

  return (
    <View style={l.root}>
      <View style={l.head}>
        <Aurora />
        <T v="small" c={color.white}>{eyebrow}</T>
        {heading ? <T v="hello" c={color.white} accessibilityRole="header" numberOfLines={1}>{heading}</T> : null}
      </View>
      <View style={l.body}>
        <View style={l.titles}>
          <T v="heading" style={l.center} accessibilityRole={heading ? undefined : 'header'}>{title}</T>
          {hint ? <T v="small" c={color.muted} style={l.center}>{hint}</T> : null}
        </View>
        <View style={l.dots} accessible accessibilityLabel={`${pin.length} of ${LENGTH}`} accessibilityLiveRegion="polite">
          {Array.from({ length: LENGTH }).map((_, i) => <View key={i} style={[l.dot, i < pin.length && l.dotOn]} />)}
        </View>
        <View style={l.noteSlot}>
          {note ? <T v="body" c={color.coral} style={l.center} accessibilityRole="alert" accessibilityLiveRegion="assertive">{note}</T> : null}
        </View>
        <View style={disabled ? l.off : undefined} pointerEvents={disabled ? 'none' : 'auto'}>
          <Keypad kind="pin" onKey={press} />
        </View>
        {footer}
      </View>
    </View>
  );
}

const l = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  head: { paddingTop: inset.top + 26, paddingBottom: space.xxl, paddingHorizontal: space.xl, overflow: 'hidden', borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  body: { flex: 1, padding: space.md, gap: space.lg, justifyContent: 'center' },
  titles: { gap: space.xs },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  dot: { width: 14, height: 14, borderRadius: radius.sm, borderWidth: 1.5, borderColor: color.muted },
  dotOn: { backgroundColor: color.text, borderColor: color.text },
  // Reserves the line so the keypad doesn't jump when a message appears.
  noteSlot: { minHeight: 24, justifyContent: 'center' },
  off: { opacity: 0.4 },
  finger: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: glass.line },
});
