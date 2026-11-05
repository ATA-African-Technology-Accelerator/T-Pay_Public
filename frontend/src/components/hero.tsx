import React, { useEffect, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { color, glass, icon, radius, space, touch } from '../theme/tokens';
import { Press, RollingMoney, T, speak } from './ui';
import { Aurora } from './aurora';
import { Eye, EyeOff, HelpCircle, Volume2 } from 'lucide-react-native';
import { BellButton, inset } from './shell';
import { useNav } from '../nav';
import { Wallet, useStore } from '../demo/store';
import { t } from '../i18n/en';

export type HeroAction = { label: string; icon: React.ReactNode; onPress(): void };
export type WalletPage = { key: Wallet; name: string; status: string; label: string; amount: number; note?: string; actions: HeroAction[] };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? t.morning : h < 17 ? t.afternoon : t.evening;
}

function Page({ page, width, shown }: { page: WalletPage; width: number; shown: boolean }) {
  const { hidden, toggleHidden } = useStore();
  const Vis = hidden ? EyeOff : Eye;
  return (
    <View style={[h.page, { width }]} aria-hidden={!shown} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}>
      <View style={h.money}>
        <View style={h.labelRow}>
          <T v="small" c={color.white}>{page.label}</T>
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? t.showBalance : t.hideBalance} hitSlop={8} onPress={toggleHidden} style={h.mini}>
            <Vis size={icon.sm} color={color.white} strokeWidth={1.8} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t.hearIt}: ${page.label}`} hitSlop={8} onPress={() => speak(`${page.label}. ${page.amount} naira`)} style={h.mini}>
            <Volume2 size={icon.sm} color={color.white} strokeWidth={1.8} />
          </Pressable>
        </View>
        {hidden
          ? <T v="moneyL" c={color.white} accessibilityLabel={t.balanceHidden}>₦ ••••••</T>
          : <RollingMoney value={page.amount} v="moneyL" c={color.white} />}
        <T v="smallStrong" c={color.white}>{hidden || !page.note ? ' ' : page.note}</T>
      </View>
      <View style={h.actions}>
        {page.actions.map(a => (
          <View key={a.label} style={{ flex: 1 }}>
            <Press accessibilityRole="button" accessibilityLabel={a.label} onPress={a.onPress} style={h.action}>
              <View style={h.pill}>{a.icon}</View>
              <T v="smallStrong" c={color.white} numberOfLines={1} adjustsFontSizeToFit>{a.label}</T>
            </Press>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The top of home. Each wallet is a page: swipe between them, or tap a wallet's name. */
export function Hero({ name, pages, wallet, onWallet }: { name: string; pages: WalletPage[]; wallet: Wallet; onWallet(w: Wallet): void }) {
  const nav = useNav();
  const width = Math.min(useWindowDimensions().width, 390);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const index = pages.findIndex(p => p.key === wallet);
  const current = pages[index];
  const shown = useRef(0);
  // While a tap carries the pager across, its in-between positions are not a swipe.
  const heading = useRef<number | null>(null);

  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    heading.current = index;
    scroller.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    if (heading.current !== null) {
      if (Math.abs(x - heading.current * width) < 2) heading.current = null;
      return;
    }
    const at = Math.round(x / width);
    if (at !== shown.current && pages[at]) { shown.current = at; onWallet(pages[at].key); }
  };

  return (
    <View style={h.hero}>
      <Aurora />
      <View style={h.top}>
        <View style={{ flex: 1 }}>
          <T v="heading" c={color.white} accessibilityRole="header" numberOfLines={1}>{`${greeting()}, ${name}`}</T>
          <T v="small" c={color.white} numberOfLines={2}>{current.status}</T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t.help} onPress={() => nav.go({ name: 'help' })} style={h.round}>
          <HelpCircle size={icon.md} color={color.white} strokeWidth={1.7} />
        </Pressable>
        <BellButton />
      </View>
      <View style={h.switch} accessibilityRole="radiogroup" accessibilityLabel={t.chooseWallet}>
        {pages.map(p => {
          const on = p.key === wallet;
          return (
            <Pressable key={p.key} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={p.name} onPress={() => onWallet(p.key)} style={[h.switchItem, on && h.switchOn]}>
              <T v="smallStrong" c={color.white}>{p.name}</T>
            </Pressable>
          );
        })}
      </View>
      <ScrollView
        ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32}
        onScrollBeginDrag={() => { heading.current = null; }}
        style={h.pager} accessibilityHint={t.swipeWallets}
      >
        {pages.map(p => <Page key={p.key} page={p} width={width} shown={p.key === wallet} />)}
      </ScrollView>
      <View style={h.dots} importantForAccessibility="no">
        {pages.map(p => <View key={p.key} style={[h.dot, p.key === wallet && h.dotOn]} />)}
      </View>
    </View>
  );
}

const h = StyleSheet.create({
  hero: { paddingTop: inset.top + 2, paddingBottom: space.md, gap: space.md, overflow: 'hidden', borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl },
  switch: { flexDirection: 'row', padding: space.xs, gap: space.xs, marginHorizontal: space.xl, borderRadius: radius.md, backgroundColor: glass.well },
  switchItem: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  switchOn: { backgroundColor: glass.fill, borderColor: glass.line },
  pager: { flexGrow: 0 },
  page: { paddingHorizontal: space.xl, gap: space.lg, justifyContent: 'space-between' },
  money: { gap: space.hair },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 34 },
  mini: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.fill },
  round: { width: 46, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: glass.line, backgroundColor: glass.fill, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { alignItems: 'center', gap: space.sm },
  pill: { alignSelf: 'stretch', height: touch.min, borderRadius: radius.pill, borderWidth: 1, borderColor: glass.line, backgroundColor: glass.fill, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignSelf: 'center', gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: glass.line },
  dotOn: { width: 18, backgroundColor: color.white },
});
