import React, { useEffect, useId, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { bodyGlow, color, glow, motion } from '../theme/tokens';
import { native, useReduceMotion } from './ui';

// One light in the glow: where its centre sits and how wide it reaches, in percent of the area
// (the same numbers the still gradient used), how long one pulse takes, how dim it gets at its
// lowest, and how much it swells at its brightest.
type Light = {
  color: string; opacity: number; cx: number; cy: number; rx: number; ry: number;
  period: number; faintest: number; swell: number;
};

// Each light pulses in place on its own loop, so together they never beat in step and the glow
// feels alive. The white light at the top dims least, so the icons over it keep their contrast.
const LIGHTS: Light[] = [
  { color: glow.mid, opacity: 1, cx: 62, cy: 48, rx: 70, ry: 60, period: motion.drift, faintest: 0.45, swell: 1.12 },
  { color: glow.bright, opacity: 1, cx: 22, cy: 104, rx: 80, ry: 66, period: motion.drift * 1.3, faintest: 0.4, swell: 1.15 },
  { color: glow.edge, opacity: 0.55, cx: 88, cy: -8, rx: 72, ry: 62, period: motion.drift * 1.6, faintest: 0.7, swell: 1.08 },
];

// Behind the body's glass cards: maroon lights that pulse slower than the hero's, so the page feels
// warm and alive without competing with it.
const BODY_LIGHTS: Light[] = [
  { color: bodyGlow.a, opacity: 0.9, cx: 90, cy: 25, rx: 75, ry: 40, period: motion.drift * 1.4, faintest: 0.55, swell: 1.1 },
  { color: bodyGlow.b, opacity: 1, cx: 5, cy: 70, rx: 85, ry: 45, period: motion.drift * 1.8, faintest: 0.5, swell: 1.12 },
  { color: bodyGlow.c, opacity: 0.6, cx: 60, cy: 105, rx: 80, ry: 35, period: motion.drift * 2.1, faintest: 0.5, swell: 1.08 },
];

/**
 * The soft white light over a navy-to-maroon glow behind the balance. Each light pulses slowly
 * in place, like breathing. Only size and fade change, which the phone animates by itself, so it costs
 * almost nothing. With Reduce motion on, it holds still. Decorative: screen readers skip it.
 */
export function Aurora({ kind = 'hero' }: { kind?: 'hero' | 'body' }) {
  const reduce = useReduceMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  return (
    <View pointerEvents="none" importantForAccessibility="no" style={[StyleSheet.absoluteFill, a.clip]} onLayout={onLayout}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: kind === 'body' ? color.page : glow.base }]} />
      {size.w > 0 && (kind === 'body' ? BODY_LIGHTS : LIGHTS).map((light, i) => <Glow key={i} light={light} size={size} still={reduce} />)}
    </View>
  );
}

function Glow({ light, size, still }: { light: Light; size: { w: number; h: number }; still: boolean }) {
  const id = useId().replace(/:/g, '');
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) { t.setValue(0.5); return; }
    const half = light.period / 2;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: half, easing: motion.ease.inOut, useNativeDriver: native }),
      Animated.timing(t, { toValue: 0, duration: half, easing: motion.ease.inOut, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, light.period]);

  const { w, h } = size;
  const box = {
    left: ((light.cx - light.rx) / 100) * w,
    top: ((light.cy - light.ry) / 100) * h,
    width: ((2 * light.rx) / 100) * w,
    height: ((2 * light.ry) / 100) * h,
  };
  const style = {
    position: 'absolute' as const,
    ...box,
    opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [light.faintest, 1, light.faintest] }),
    transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, light.swell, 1] }) }],
  };
  return (
    <Animated.View style={style}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`g${id}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={light.color} stopOpacity={light.opacity} />
            <Stop offset="1" stopColor={light.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#g${id})`} />
      </Svg>
    </Animated.View>
  );
}

const a = StyleSheet.create({ clip: { overflow: 'hidden' } });
