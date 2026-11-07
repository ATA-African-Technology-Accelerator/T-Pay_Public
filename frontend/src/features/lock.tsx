import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { color, glass, icon, radius, space, touch } from '../theme/tokens';
import { Press, T, money } from '../components/ui';
import { Aurora } from '../components/aurora';
import { Keypad } from '../components/keypad';
import { inset } from '../components/shell';
import { useNav } from '../nav';
import { useStore } from '../demo/store';
import { t } from '../i18n/en';

const LENGTH = 4;

/** Sign in, the way a bank app does it: your name, then PIN or fingerprint. */
export function Lock() {
  const nav = useNav();
  const { name } = useStore();
  const [pin, setPin] = useState('');
  const open = () => nav.reset({ name: 'home' });
  useEffect(() => { if (pin.length === LENGTH) open(); }, [pin]);
  const press = (k: string) => setPin(p => (k === 'del' ? p.slice(0, -1) : (p + k).slice(0, LENGTH)));
  return (
    <View style={l.root}>
      <View style={l.head}>
        <Aurora />
        <T v="small" c={color.white}>{t.welcome}</T>
        <T v="hello" c={color.white} accessibilityRole="header" numberOfLines={1}>{name}</T>
      </View>
      <View style={l.body}>
        <T v="heading" style={l.center}>{t.enterPin}</T>
        <View style={l.dots} accessible accessibilityLabel={`${pin.length} of ${LENGTH}`} accessibilityLiveRegion="polite">
          {Array.from({ length: LENGTH }).map((_, i) => <View key={i} style={[l.dot, i < pin.length && l.dotOn]} />)}
        </View>
        <Keypad kind="pin" onKey={press} />
        <Press accessibilityRole="button" accessibilityLabel={t.useFingerprint} onPress={open} style={l.finger}>
          <Fingerprint size={icon.md} color={color.blue} strokeWidth={1.8} />
          <T v="label">{t.useFingerprint}</T>
        </Press>
      </View>
    </View>
  );
}

const l = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  head: { paddingTop: inset.top + 26, paddingBottom: space.xxl, paddingHorizontal: space.xl, overflow: 'hidden', borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  body: { flex: 1, padding: space.md, gap: space.lg, justifyContent: 'center' },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  dot: { width: 14, height: 14, borderRadius: radius.sm, borderWidth: 1.5, borderColor: color.muted },
  dotOn: { backgroundColor: color.text, borderColor: color.text },
  finger: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: glass.line },
});
