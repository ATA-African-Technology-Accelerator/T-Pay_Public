import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, TextProps, View, ViewStyle, StyleProp, useWindowDimensions,
} from 'react-native';
import { Volume2, WifiOff } from 'lucide-react-native';
import { color, icon, layout, motion, radius, space, touch, type } from '../theme/tokens';
import { catalogueLanguage, t } from '../i18n';
import { speechOut } from '../composition';

export const native = Platform.OS !== 'web';

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

export function T({ v = 'body', c = color.text, style, ...rest }: TextProps & { v?: keyof typeof type; c?: string }) {
  return <Text {...rest} style={[type[v], { color: c }, style]} />;
}

// Every amount in code is an integer in minor units (kobo, cents). These format it
// for the screen, and are the only place that divides.
const group = (n: number) => n.toLocaleString('en-US');
const minor = (n: number) => `${group(Math.trunc(n / 100))}.${String(Math.abs(n % 100)).padStart(2, '0')}`;
/** ₦1,250.50 from 125050 kobo. */
export const money = (kobo: number) => `₦${minor(kobo)}`;
/** ₦1,250 from 125050 kobo, for keypads and short labels. */
export const naira = (kobo: number) => `₦${group(Math.round(kobo / 100))}`;
/** $8.33 from 833 cents. */
export const usd = (cents: number) => `$${minor(cents)}`;
/** ₦1,500.00 from the contract's decimal rate string "1500.00". */
export const rate = (fxRate: string) => {
  const [whole = '0', part = '00'] = fxRate.split('.');
  return `₦${group(Number(whole))}.${part}`;
};
/** Spoken form: "1,250 naira". */
export const sayNaira = (kobo: number) => `${group(Math.round(kobo / 100))} naira`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');
/** 8 Nov 2026, 12:56 in the phone's time zone. */
export function when(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}
/**
 * The width the app has to work with. A real phone gives the app its whole width, whatever it
 * is: 360, 411 or a tablet's. Only the web preview is held to a phone-shaped 390.
 */
export const useScreenWidth = () => Math.min(useWindowDimensions().width, layout.maxWidth);
export const useCardW = () => useScreenWidth() - space.md * 2;

export function Card({ w, h, fill, pill, onPill, pillLabel, children, style }: {
  w: number; h: number; fill: string; pill?: React.ReactNode; onPill?(): void; pillLabel?: string; children?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.card, { width: w, height: h, backgroundColor: fill }, style]}>
      {children}
      {pill && <Pressable accessibilityRole={onPill ? 'button' : undefined} accessibilityLabel={pillLabel} disabled={!onPill} onPress={onPill} style={s.pill}>{pill}</Pressable>}
    </View>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.panel, style]}>{children}</View>;
}

/** Fades content up once. Delay lets a list arrive in reading order. */
export function Rise({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: motion.slow, delay: reduce ? 0 : delay, easing: motion.ease.out, useNativeDriver: native }).start();
  }, []);
  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 12, 0] });
  return <Animated.View style={[style, { opacity: a, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** A number that rolls to its new value, so the person sees money move. */
export function RollingMoney({ value, v = 'money', c = color.text }: { value: number; v?: keyof typeof type; c?: string }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const id = a.addListener(({ value: x }) => setShown(Math.round(x)));
    Animated.timing(a, { toValue: value, duration: motion.count, easing: motion.ease.out, useNativeDriver: false }).start();
    return () => a.removeListener(id);
  }, [value, reduce]);
  return <T v={v} c={c} accessibilityLabel={money(value)} style={s.tab} numberOfLines={1} adjustsFontSizeToFit>{money(shown)}</T>;
}

/** Pressed things settle to 0.96, the same everywhere. */
export function Press({ children, style, disabled, ...rest }: React.ComponentProps<typeof Pressable> & { style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.timing(scale, { toValue: v, duration: motion.quick, easing: motion.ease.out, useNativeDriver: native }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable {...rest} disabled={disabled} onPressIn={() => !disabled && !reduce && to(0.96)} onPressOut={() => to(1)} style={style}>{children as React.ReactNode}</Pressable>
    </Animated.View>
  );
}

type BtnProps = {
  label: string; onPress(): void; icon?: React.ReactNode; kind?: 'solid' | 'soft' | 'quiet'; hint?: string; style?: StyleProp<ViewStyle>; disabled?: boolean; loading?: boolean;
};
export function Button({ label, onPress, icon, kind = 'solid', hint, style, disabled, loading }: BtnProps) {
  const ink = kind === 'solid' ? color.ink : color.text;
  return (
    <View style={style}>
      <Press
        accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} disabled={disabled || loading}
        accessibilityState={{ disabled: !!disabled, busy: !!loading }} onPress={onPress}
        style={[s.btn, kind === 'solid' && s.solid, kind === 'soft' && s.soft, kind === 'quiet' && s.quiet, disabled && s.off]}
      >
        {loading ? <ActivityIndicator size="small" color={ink} /> : icon}
        <T v="heading" c={ink}>{label}</T>
      </Press>
    </View>
  );
}

/** Placeholder rows, shaped like the list they stand in for. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: motion.pulse / 2, easing: motion.ease.inOut, useNativeDriver: native }),
      Animated.timing(a, { toValue: 0.5, duration: motion.pulse / 2, easing: motion.ease.inOut, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  return (
    <Animated.View style={{ opacity: a, gap: space.md }} accessible accessibilityLabel={t.loading} accessibilityLiveRegion="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={s.skRow}>
          <View style={s.skMark} />
          <View style={{ flex: 1, gap: space.sm }}>
            <View style={[s.skLine, { width: '70%' }]} />
            <View style={[s.skLine, { width: '45%' }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** Speaks in the chosen language when the phone has a voice for it, and stays silent otherwise (FR-34). */
export function speak(text: string) {
  void speechOut.speak(text, catalogueLanguage());
}

/** The assistant talking: a lifelike voice when online, the phone's voice otherwise. */
export function speakNaturally(text: string): Promise<void> {
  return speechOut.speak(text, catalogueLanguage(), true);
}

/**
 * Marks money that moved phone to phone with no network, so it reads apart from deposits and
 * pay-link payments. An icon and a word, never colour alone.
 */
export function OfflineTag() {
  return (
    <View style={s.tag} accessibilityLabel={t.offlineTag}>
      <WifiOff size={12} color={color.icon} strokeWidth={2} />
      <T v="micro" c={color.icon}>{t.offlineTag}</T>
    </View>
  );
}

/** `auto` also reads it once when the screen opens: for results, so nobody has to tap to hear them. */
export function HearIt({ say, auto = false }: { say: string; auto?: boolean }) {
  useEffect(() => { if (auto) void speakNaturally(say); }, [auto]);
  return (
    <Press accessibilityRole="button" accessibilityLabel={t.hearIt} onPress={() => { void speakNaturally(say); }} style={s.hear}>
      <Volume2 size={icon.sm} color={color.text} strokeWidth={1.8} />
      <T v="label">{t.hearIt}</T>
    </Press>
  );
}

const s = StyleSheet.create({
  tab: { fontVariant: ['tabular-nums'] },
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  pill: { position: 'absolute', top: space.md, right: space.md, minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.panelHigh, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm },
  panel: { backgroundColor: color.panel, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  btn: { minHeight: touch.button, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.xl },
  solid: { backgroundColor: color.text },
  soft: { backgroundColor: color.panelHigh },
  quiet: { minHeight: touch.min },
  off: { opacity: 0.35 },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skMark: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.panelHigh },
  skLine: { height: space.md, borderRadius: radius.pill, backgroundColor: color.panelHigh },
  tag: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.hair, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, backgroundColor: color.panel },
  hear: { alignSelf: 'center', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: color.panelHigh },
});
