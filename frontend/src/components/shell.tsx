import React from 'react';
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowLeft, Bell, Mic, ReceiptText } from 'lucide-react-native';
import { Aurora } from './aurora';
import { color, font, glass, icon, radius, space } from '../theme/tokens';
import { T } from './ui';
import { BagIcon, HomeIcon } from './icons';
import { Route, useNav } from '../nav';
import { useApp } from '../state/appState';
import { t } from '../i18n';

const web = Platform.OS === 'web';
export const inset = { top: web ? 54 : (StatusBar.currentHeight ?? 24) + 8, bottom: web ? 26 : 12 };

export function BellButton() {
  const nav = useNav();
  const { history } = useApp();
  const n = history.filter(e => e.status === 'pending' || e.status === 'sent').length;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={n ? `${t.alerts}, ${n} ${t.status.pending}` : t.alerts}
      onPress={() => nav.reset({ name: 'activity' })} style={l.round}
    >
      <Bell size={icon.md} color={color.white} strokeWidth={1.7} />
      {n > 0 && <View style={l.badge}><T v="micro" c={color.ink}>{n}</T></View>}
    </Pressable>
  );
}

export function CurvedHeader({ title, back, home, bell = true }: { title?: string; back?: boolean; home?: boolean; bell?: boolean }) {
  const nav = useNav();
  return (
    <View style={l.header}>
      <Aurora />
      {back || home ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.goBack} onPress={home ? () => nav.reset({ name: 'home' }) : nav.back} style={l.round}>
          <ArrowLeft size={icon.md} color={color.white} strokeWidth={1.8} />
        </Pressable>
      ) : bell ? <View style={{ width: 46 }} /> : null}
      <T v="title" c={color.white} accessibilityRole="header" numberOfLines={2} style={l.title}>{title}</T>
      {bell ? <BellButton /> : back || home ? <View style={{ width: 46 }} /> : null}
    </View>
  );
}

export function Avatar({ name, size = 46, tone = color.panelHigh }: { name: string; size?: number; tone?: string }) {
  return (
    <View importantForAccessibility="no" style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
      <T v={size >= 54 ? 'hello' : 'section'}>{name[0]}</T>
    </View>
  );
}

export function Screen({ children, head, hero, footer, tabsFor }: {
  children: React.ReactNode; head?: React.ReactNode; hero?: React.ReactNode; tabsFor?: Route['name']; footer?: React.ReactNode;
}) {
  return (
    <View style={l.root}>
      {head}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[{ flexGrow: 1 }, tabsFor && { paddingBottom: 72 + inset.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {hero}
        <View style={l.body}>{children}</View>
      </ScrollView>
      {footer && <View style={l.footer}>{footer}</View>}
      {tabsFor && <Tabs active={tabsFor} />}
    </View>
  );
}

export function Section({ title, action, onAction }: { title: string; action?: string; onAction?(): void }) {
  return (
    <View style={l.section}>
      <T v="section" accessibilityRole="header">{title}</T>
      {action && (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} hitSlop={10} disabled={!onAction}>
          <T v="small" c={color.blue}>{action}</T>
        </Pressable>
      )}
    </View>
  );
}

/** Docked menu. Every item keeps its word: an icon alone means nothing to a first-time user. */
function Tabs({ active }: { active: Route['name'] }) {
  const nav = useNav();
  type Item = { key: Route['name']; label: string; Icon: typeof HomeIcon; to?: Route };
  const Rec: typeof HomeIcon = ({ size, c, w }) => <ReceiptText size={size} color={c} strokeWidth={w} />;
  const Me: typeof HomeIcon = ({ size, c, w }) => <ProfileGlyph size={size} c={c} w={w} />;
  const left: Item[] = [{ key: 'home', label: t.home, Icon: HomeIcon }, { key: 'vault', label: t.vault, Icon: BagIcon }];
  const right: Item[] = [{ key: 'activity', label: t.activity, Icon: Rec }, { key: 'settings', label: t.profile, Icon: Me }];
  const tab = ({ key, label, Icon, to }: Item) => {
    const on = key === active;
    return (
      <Pressable
        key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
        onPress={() => (to ? nav.go(to) : nav.reset({ name: key } as Route))} style={l.tab}
      >
        <Icon size={icon.md} c={on ? color.blue : color.muted} w={1.7} />
        <T v="micro" c={on ? color.text : color.muted} numberOfLines={1} style={on && { fontFamily: font.semibold }}>{label}</T>
      </Pressable>
    );
  };
  const onMic = active === 'speak';
  return (
    <View style={l.tabs} accessibilityRole="tablist">
      {left.map(tab)}
      <Pressable
        accessibilityRole="tab" accessibilityState={{ selected: onMic }} accessibilityLabel={t.speak}
        onPress={() => nav.reset({ name: 'speak' })} style={l.tab}
      >
        <View style={l.micGap} />
        <View style={l.mic}>
          <BlurView intensity={45} tint="dark" experimentalBlurMethod="dimezisBlurView" style={l.micBlur} />
          <View pointerEvents="none" style={l.micGlass} />
          <View style={l.micIcon}><Mic size={icon.lg} color={onMic ? color.blue : color.white} strokeWidth={1.9} /></View>
        </View>
        <T v="micro" c={onMic ? color.text : color.muted} numberOfLines={1} style={onMic && { fontFamily: font.semibold }}>{t.speak}</T>
      </Pressable>
      {right.map(tab)}
    </View>
  );
}

function ProfileGlyph({ size = 23, c = color.muted }: { size?: number; c?: string; w?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={{ width: 9, height: 9, borderRadius: radius.pill, borderWidth: 1.7, borderColor: c, marginTop: space.hair }} />
      <View style={{ width: 16, height: 8, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm, borderWidth: 1.7, borderBottomWidth: 0, borderColor: c, marginTop: space.hair }} />
    </View>
  );
}

const l = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.page },
  header: { paddingTop: inset.top + 2, paddingBottom: space.md, paddingHorizontal: space.xl, overflow: 'hidden', borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  round: { width: 46, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: glass.line, backgroundColor: glass.fill, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 3, minWidth: 16, height: 16, borderRadius: radius.sm, backgroundColor: color.amber, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  body: { flexGrow: 1, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.xl, gap: space.md },
  footer: { paddingHorizontal: space.md, paddingBottom: inset.bottom + space.xs, paddingTop: space.sm, gap: space.sm, backgroundColor: color.page },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 30, marginTop: space.xs },
  tabs: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: color.page, borderTopWidth: 1, borderTopColor: color.line,
    paddingHorizontal: space.xs, paddingTop: space.sm, paddingBottom: inset.bottom - 6,
  },
  tab: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: space.hair },
  // The mic sits above the bar on real glass, so the list is seen blurred behind it.
  micGap: { height: 23 },
  mic: { position: 'absolute', top: -30, alignSelf: 'center', width: 64, height: 64, borderRadius: radius.pill, overflow: 'hidden', borderWidth: 1, borderColor: glass.lineStrong, alignItems: 'center', justifyContent: 'center' },
  micBlur: { ...StyleSheet.absoluteFill, borderRadius: radius.pill, overflow: 'hidden' },
  micGlass: { ...StyleSheet.absoluteFill, borderRadius: radius.pill, backgroundColor: glass.tint },
  micIcon: { zIndex: 1 },
});
