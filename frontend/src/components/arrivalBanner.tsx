import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { CircleCheck } from 'lucide-react-native';
import { color, glass, icon, motion, radius, space } from '../theme/tokens';
import { T, money, native, speakNaturally, useReduceMotion } from './ui';
import { useInset } from './shell';
import { onMoneyArrived, type Arrival } from '../sync/syncCoordinator';
import { t } from '../i18n';

const SHOW_MS = 4500;

function sentence(all: Arrival[]): string {
  const out = all.filter(a => a.kind === 'CASHED_OUT');
  const arrivals = all.filter(a => a.kind !== 'CASHED_OUT');
  const sent = out.length ? t.cashedOut(money(out.reduce((sum, a) => sum + a.amountNgnMinor, 0))) : '';
  if (!arrivals.length) return sent;
  const came = received(arrivals);
  return sent ? `${came}. ${sent}` : came;
}

function received(arrivals: Arrival[]): string {
  if (arrivals.length > 1) {
    return t.arrivedMany(money(arrivals.reduce((sum, a) => sum + a.amountNgnMinor, 0)), arrivals.length);
  }
  const [only] = arrivals as [Arrival];
  if (only.kind === 'DEPOSIT') return t.arrivedAdded(money(only.amountNgnMinor));
  if (only.kind === 'PAYMENT_LINK') return t.arrivedLink(money(only.amountNgnMinor));
  return t.arrivedReceived(money(only.amountNgnMinor));
}

/** Slides in at the top when money lands in the Wallet after a sync, then goes by itself. */
export function ArrivalBanner() {
  const inset = useInset();
  const reduce = useReduceMotion();
  const [text, setText] = useState<string | null>(null);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => onMoneyArrived(arrivals => {
    const said = sentence(arrivals);
    setText(said);
    void speakNaturally(said);
  }), []);
  useEffect(() => {
    if (!text) return;
    Animated.timing(a, { toValue: 1, duration: motion.base, easing: motion.ease.out, useNativeDriver: native }).start();
    const id = setTimeout(() => {
      Animated.timing(a, { toValue: 0, duration: motion.base, easing: motion.ease.out, useNativeDriver: native }).start(() => setText(null));
    }, SHOW_MS);
    return () => clearTimeout(id);
  }, [text]);
  if (!text) return null;
  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : -24, 0] });
  return (
    <View pointerEvents="none" style={[b.wrap, { top: inset.top + space.sm }]}>
      <Animated.View style={[b.banner, { opacity: a, transform: [{ translateY }] }]} accessibilityLiveRegion="polite" accessible accessibilityLabel={text}>
        <CircleCheck size={icon.md} color={color.green} strokeWidth={2} />
        <T v="label" style={{ flex: 1 }}>{text}</T>
      </Animated.View>
    </View>
  );
}

const b = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  banner: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: glass.line, backgroundColor: color.sheet },
});
