import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect, Line } from 'react-native-svg';
import { color, motion, radius, space, touch } from '../theme/tokens';
import QRCode from 'react-native-qrcode-svg';
import { T, naira, native, useReduceMotion } from './ui';
import { t } from '../i18n';

const NOTES = [1000, 500, 200, 100, 50];
const NOTE_W = 92, NOTE_H = 50, FAN = 6;

/** Naira notes for an amount in kobo. Kobo below one naira is not shown as a note. */
export function breakIntoNotes(kobo: number) {
  let left = Math.floor(kobo / 100);
  const out: { value: number; count: number }[] = [];
  for (const value of NOTES) {
    const count = Math.floor(left / value);
    if (count) { out.push({ value, count }); left -= count * value; }
  }
  return out;
}

const noteFace = (_v: number) => ({ bg: color.panelHigh, bd: color.line });

export function Note({ value, w = NOTE_W, h = NOTE_H }: { value: number; w?: number; h?: number }) {
  const f = noteFace(value);
  return (
    <View style={[n.note, { width: w, height: h, backgroundColor: f.bg }]}>
      <View style={[n.inner, { borderColor: f.bd }]}><T v="smallStrong">{naira(value * 100)}</T></View>
    </View>
  );
}

/** Money as a fanned pile of notes. A person who cannot read 2,000 can still count two notes. */
export function NoteStack({ amount }: { amount: number }) {
  const reduce = useReduceMotion();
  const groups = breakIntoNotes(amount);
  return (
    <View
      style={n.row} accessible
      accessibilityLabel={groups.map(g => t.notesOf(g.count, naira(g.value * 100))).join(", ")}
    >
      {groups.map((g, i) => <Pile key={g.value} value={g.value} count={g.count} delay={reduce ? 0 : i * motion.stagger} />)}
    </View>
  );
}

function Pile({ value, count, delay }: { value: number; count: number; delay: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: motion.base, delay, easing: motion.ease.out, useNativeDriver: native }).start();
  }, [count]);
  const shown = Math.min(count, 4);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }}>
      <View style={{ width: NOTE_W + (shown - 1) * FAN, height: NOTE_H + (shown - 1) * FAN }}>
        {Array.from({ length: shown }).map((_, i) => (
          <View key={i} style={{ position: 'absolute', left: i * FAN, top: (shown - 1 - i) * FAN }}><Note value={value} /></View>
        ))}
      </View>
      {count > 1 && <T v="small" c={color.muted} style={{ textAlign: 'center', marginTop: space.xs }}>{t.noteCount(count)}</T>}
    </Animated.View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** A shape for every state. Solid disc paid, moving ring pending, open ring sent, heavy square refused. */
export function StatusMark({ status, size = 44, big }: { status: 'paid' | 'pending' | 'sent' | 'refused' | 'blocked'; size?: number; big?: boolean }) {
  const reduce = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const draw = useRef(new Animated.Value(big && !reduce ? 0 : 1)).current;
  useEffect(() => {
    if (status === 'pending' && !reduce) {
      const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: motion.spin, easing: motion.ease.linear, useNativeDriver: native }));
      loop.start();
      return () => loop.stop();
    }
  }, [status, reduce]);
  useEffect(() => {
    if (big) Animated.timing(draw, { toValue: 1, duration: motion.slow, delay: motion.stagger * 2, easing: motion.ease.out, useNativeDriver: false }).start();
  }, []);
  const offset = draw.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });
  const ring = draw.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const label = t.status[status];
  const b = 48;
  return (
    <View accessible accessibilityLabel={label} style={{ width: size, height: size }}>
      {status === 'pending' ? (
        <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
          <Svg width={size} height={size} viewBox={`0 0 ${b} ${b}`}>
            <Circle cx={24} cy={24} r={20} fill="none" stroke={color.text} strokeWidth={4} strokeDasharray="7 7" strokeLinecap="round" />
            <Circle cx={24} cy={24} r={5} fill={color.text} />
          </Svg>
        </Animated.View>
      ) : (
        <Animated.View style={{ transform: [{ scale: ring }] }}>
          <Svg width={size} height={size} viewBox={`0 0 ${b} ${b}`}>
            {status === 'paid' && <>
              <Circle cx={24} cy={24} r={23} fill={color.green} />
              {big && native
                ? <AnimatedPath d="M13 25l8 8 15-17" fill="none" stroke={color.ink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="60" strokeDashoffset={offset as any} />
                : <Path d="M13 25l8 8 15-17" fill="none" stroke={color.ink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />}
            </>}
            {status === 'sent' && <>
              <Circle cx={24} cy={24} r={21} fill="none" stroke={color.text} strokeWidth={4} />
              <Path d="M17 31l14-14M20 17h11v11" fill="none" stroke={color.text} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            </>}
            {status === 'refused' && <>
              <Rect x={3} y={3} width={42} height={42} rx={8} fill={color.coral} />
              <Line x1={15} y1={15} x2={33} y2={33} stroke={color.ink} strokeWidth={5} strokeLinecap="round" />
              <Line x1={33} y1={15} x2={15} y2={33} stroke={color.ink} strokeWidth={5} strokeLinecap="round" />
            </>}
            {status === 'blocked' && <>
              <Path d="M16 3h16l13 13v16L32 45H16L3 32V16z" fill="none" stroke={color.text} strokeWidth={4} strokeLinejoin="round" />
              <Line x1={14} y1={24} x2={34} y2={24} stroke={color.text} strokeWidth={5} strokeLinecap="round" />
            </>}
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

/** Three-step dots: where you are in the exchange between two phones. */
export function Steps({ at }: { at: 1 | 2 | 3 }) {
  return (
    <View style={n.steps} accessible accessibilityLabel={t.stepOf(at, 3)}>
      {[1, 2, 3].map(i => <View key={i} style={[n.step, i <= at && n.stepOn]} />)}
    </View>
  );
}

/**
 * A frame as a QR code. Dark on white whatever the theme, or cameras can't read it.
 * Low error correction keeps a voucher frame (about 2 KB) scannable on a phone screen.
 */
export function FrameCode({ value, size = 250, label }: { value: string; size?: number; label: string }) {
  return (
    <View style={n.code} accessible accessibilityLabel={label}>
      <QRCode value={value} size={size} ecl="L" color={color.ink} backgroundColor={color.white} quietZone={4} />
    </View>
  );
}

const n = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.md, minHeight: 66 },
  note: { borderRadius: radius.sm, padding: space.xs },
  inner: { flex: 1, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  // Codes stay dark on white whatever the theme, or cameras cannot read them.
  code: { backgroundColor: color.white, padding: space.md, borderRadius: radius.md },
  steps: { flexDirection: 'row', gap: space.sm },
  step: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: color.line },
  stepOn: { backgroundColor: color.blue },
});
