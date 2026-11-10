import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { color, icon, motion, radius, space } from '../theme/tokens';
import { Press, Rise, Skeleton, T, money, when } from './ui';
import { BagIcon, CoinPlusIcon, HandCoinIcon } from './icons';
import { Entry, Status, useApp } from '../state/appState';
import { useNav } from '../nav';
import { t } from '../i18n';

const tone: Record<Status, { word: string; Icon: typeof BagIcon }> = {
  paid: { word: color.green, Icon: BagIcon },
  locked: { word: color.blue, Icon: CoinPlusIcon },
  pending: { word: color.amber, Icon: HandCoinIcon },
  sent: { word: color.muted, Icon: HandCoinIcon },
  refused: { word: color.coral, Icon: CoinPlusIcon },
  blocked: { word: color.coral, Icon: CoinPlusIcon },
};

const unsigned = (e: Entry) => e.dir === 'lock' || e.dir === 'release' || e.status === 'refused' || e.status === 'blocked';
const signed = (e: Entry) => (unsigned(e) ? money(e.amount) : `${e.dir === 'in' ? '+' : '-'}${money(e.amount)}`);

/** One row per entry: mark, who and when, then the amount with its status word. */
export function ActivityRows({ rows }: { rows: Entry[] }) {
  const nav = useNav();
  const { ready } = useApp();
  if (!ready) return <Skeleton />;
  if (!rows.length) return <T v="body" c={color.muted} style={r.empty}>{t.nothingHere}</T>;
  return (
    <View style={r.list}>
      {rows.map((e, i) => {
        const k = tone[e.status];
        return (
          <Rise key={e.id} delay={Math.min(i, 6) * motion.stagger}>
            <Press
              accessibilityRole="button" accessibilityLabel={`${e.who}, ${money(e.amount)}, ${t.status[e.status]}`} accessibilityHint={t.receipt}
              onPress={() => nav.go({ name: 'receipt', id: e.id })} style={r.row}
            >
              <View style={r.mark}><k.Icon size={icon.md} c={k.word} w={1.7} /></View>
              <View style={{ flex: 1 }}>
                <T v="label" numberOfLines={2}>{e.who}</T>
                <T v="small" c={color.muted} numberOfLines={1}>{when(e.at)}</T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: space.hair }}>
                <T v="label" style={r.nums}>{signed(e)}</T>
                <T v="small" c={k.word}>{t.status[e.status]}</T>
              </View>
            </Press>
          </Rise>
        );
      })}
    </View>
  );
}

/** Two figures side by side. */
export function Duo({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={r.duo}>
      {items.map((x, i) => (
        <Rise key={x.label} delay={i * motion.stagger} style={{ flex: 1 }}>
          <View style={r.duoCard} accessible accessibilityLabel={`${x.label}, ${x.value}`}>
            <T v="small" c={color.muted} numberOfLines={1}>{x.label}</T>
            <T v="label" numberOfLines={1} adjustsFontSizeToFit style={r.nums}>{x.value}</T>
          </View>
        </Rise>
      ))}
    </View>
  );
}

/** A label and its value on one line, the value right-aligned. */
export function Line({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <View style={r.line} accessible accessibilityLabel={`${label}, ${value}`}>
      <T v="body" c={color.muted}>{label}</T>
      <T v={strong ? 'heading' : 'label'} style={[r.value, mono && r.nums]} selectable={mono}>{value}</T>
    </View>
  );
}

export function Segment<K extends string>({ value, options, onChange }: { value: K; options: { key: K; label: string }[]; onChange(k: K): void }) {
  return (
    <View style={r.seg} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label} onPress={() => onChange(o.key)} style={[r.segItem, on && r.segOn]}>
            <T v="label" c={on ? color.text : color.muted}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const r = StyleSheet.create({
  list: { gap: space.xs },
  empty: { textAlign: 'center', paddingVertical: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  mark: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.panelHigh, alignItems: 'center', justifyContent: 'center' },
  nums: { fontVariant: ['tabular-nums'] },
  duo: { flexDirection: 'row', gap: space.md },
  duoCard: { gap: space.hair, padding: space.lg, borderRadius: radius.md, backgroundColor: color.panel },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  value: { flexShrink: 1, textAlign: 'right' },
  seg: { flexDirection: 'row', borderRadius: radius.md, padding: 0 },
  segItem: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: color.panelHigh },
});
