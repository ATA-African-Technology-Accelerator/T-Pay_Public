import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ChevronRight, Globe, HelpCircle, Landmark, Lock, Mic, ReceiptText, UserRound, X } from 'lucide-react-native';
import { color, glass, icon, motion, radius, space, touch } from '../theme/tokens';
import { T, native, useReduceMotion } from './ui';
import { Avatar, inset } from './shell';
import { BagIcon, HomeIcon } from './icons';
import { Route, useNav } from '../nav';
import { useApp } from '../state/appState';
import { t } from '../i18n';

type Item = { label: string; draw(c: string): React.ReactNode; to: Route; stack?: boolean };

const line = (Icon: typeof Globe) => (c: string) => <Icon size={icon.md} color={c} strokeWidth={1.7} />;
const MAIN: Item[] = [
  { label: t.home, draw: c => <HomeIcon size={icon.md} c={c} w={1.7} />, to: { name: 'home' } },
  { label: t.vaultTitle, draw: c => <BagIcon size={icon.md} c={c} w={1.7} />, to: { name: 'vault' } },
  { label: t.activity, draw: line(ReceiptText), to: { name: 'activity' } },
  { label: t.received, draw: line(Landmark), to: { name: 'ledger' }, stack: true },
  { label: t.speak, draw: line(Mic), to: { name: 'speak' } },
  { label: t.profile, draw: line(UserRound), to: { name: 'settings' } },
];
const MORE: Item[] = [
  { label: t.changeLanguage, draw: line(Globe), to: { name: 'language' }, stack: true },
  { label: t.lockApp, draw: line(Lock), to: { name: 'lock' } },
  { label: t.help, draw: line(HelpCircle), to: { name: 'help' }, stack: true },
];

/** Slide-in menu opened from the three-line button on home. The cross, a tap outside or Android back all close it. */
export function SideMenu({ open, current, onClose }: { open: boolean; current: Route['name']; onClose(): void }) {
  const nav = useNav();
  const { name } = useApp();
  const width = Math.min(useWindowDimensions().width, 390);
  const reduce = useReduceMotion();
  const panel = Math.min(width - 56, 320);
  const a = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) setShown(true);
    Animated.timing(a, { toValue: open ? 1 : 0, duration: open ? motion.base : motion.quick, easing: motion.ease.out, useNativeDriver: native })
      .start(({ finished }) => { if (finished && !open) setShown(false); });
  }, [open]);
  if (!shown) return null;

  const pick = (x: Item) => { onClose(); if (x.stack) nav.go(x.to); else nav.reset(x.to); };
  const row = (x: Item) => {
    const on = x.to.name === current;
    return (
      <Pressable
        key={x.label} accessibilityRole="button" accessibilityLabel={x.label} accessibilityState={{ selected: on }}
        onPress={() => pick(x)} style={({ pressed }) => [m.row, on && m.rowOn, pressed && !on && m.rowPressed]}
      >
        {x.draw(on ? color.ink : color.text)}
        <T v="heading" c={on ? color.ink : color.text} numberOfLines={1} style={{ flex: 1 }}>{x.label}</T>
        {!on && <ChevronRight size={icon.sm} color={color.muted} strokeWidth={1.8} />}
      </Pressable>
    );
  };
  const translateX = a.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : -panel, 0] });
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, m.scrim, { opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.closeMenu} onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[m.panel, { width: panel, opacity: reduce ? a : 1, transform: [{ translateX }] }]}>
        <View style={m.head}>
          <Avatar name={name} />
          <T v="section" numberOfLines={2} style={{ flex: 1 }}>{name}</T>
          <Pressable accessibilityRole="button" accessibilityLabel={t.closeMenu} onPress={onClose} style={m.close}>
            <X size={icon.md} color={color.white} strokeWidth={1.8} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={m.list} showsVerticalScrollIndicator={false}>
          {MAIN.map(row)}
          <View style={m.rule} />
          {MORE.map(row)}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const m = StyleSheet.create({
  scrim: { backgroundColor: color.black },
  panel: {
    position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: color.panel, borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.lg,
    paddingTop: inset.top + space.hair, paddingBottom: inset.bottom, paddingHorizontal: space.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: space.lg, paddingHorizontal: space.xs },
  close: { width: 46, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: glass.line, backgroundColor: glass.fill, alignItems: 'center', justifyContent: 'center' },
  list: { gap: space.xs, paddingBottom: space.md },
  row: { minHeight: touch.button, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  rowOn: { backgroundColor: color.blue },
  rowPressed: { backgroundColor: color.panelHigh },
  rule: { height: 1, backgroundColor: color.line, marginVertical: space.sm, marginHorizontal: space.sm },
});
