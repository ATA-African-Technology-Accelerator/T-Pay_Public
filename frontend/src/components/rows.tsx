import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { color, icon, motion, radius, space } from '../theme/tokens';
import { Card, Press, Rise, Skeleton, T, money, naira, useCardW, useReduceMotion } from './ui';
import { BagIcon, CoinPlusIcon, HandCoinIcon } from './icons';
import { Entry, Status, useStore } from '../demo/store';
import { useNav } from '../nav';
import { t } from '../i18n/en';

const tone: Record<Status, { word: string; Icon: typeof BagIcon }> = {
  paid: { word: color.green, Icon: BagIcon },
  locked: { word: color.blue, Icon: CoinPlusIcon },
  pending: { word: color.amber, Icon: HandCoinIcon },
  sent: { word: color.muted, Icon: HandCoinIcon },
  refused: { word: color.coral, Icon: CoinPlusIcon },
  blocked: { word: color.coral, Icon: CoinPlusIcon },
};

const signed = (e: Entry) => (e.dir === 'lock' || e.status === 'refused' || e.status === 'blocked' ? money(e.amount) : `${e.dir === 'in' ? '+' : '-'}${money(e.amount)}`);

/** One row per entry: mark, who and when, then the amount with its status word. */
export function ActivityRows({ rows }: { rows: Entry[] }) {
  const nav = useNav();
  const { ready } = useStore();
  if (!ready) return <Skeleton />;
  if (!rows.length) return <T v="body" c={color.muted} style={r.empty}>{t.nothingHere}</T>;
  return (
    <View style={r.list}>
      {rows.map((e, i) => {
        const k = tone[e.status];
        return (
          <Rise key={e.id} delay={i * motion.stagger}>
            <Press
              accessibilityRole="button" accessibilityLabel={`${e.who}, ${e.amount} naira, ${t.status[e.status]}`} accessibilityHint={t.receipt}
              onPress={() => nav.go({ name: 'receipt', id: e.id })} style={r.row}
            >
              <View style={r.mark}><k.Icon size={icon.md} c={k.word} w={1.7} /></View>
              <View style={{ flex: 1 }}>
                <T v="label" numberOfLines={2}>{e.who}</T>
                <T v="small" c={color.muted} numberOfLines={1}>{e.when}</T>
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

/** Two figures side by side, each with a soft mark. */
export function Duo({ items }: { items: { label: string; value: string; fill: string; icon: React.ReactNode }[] }) {
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

function Bar({ h, on, delay }: { h: number; on: boolean; delay: number }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(reduce ? h : 8)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: h, duration: reduce ? 0 : motion.bar, delay: reduce ? 0 : delay, easing: motion.ease.out, useNativeDriver: false }).start();
  }, [h, reduce]);
  return <Animated.View style={[r.bar, { height: a, backgroundColor: on ? color.blue : color.panelHigh }]} />;
}

/** Rounded bars on the navy folder. Tap a day to read its amount; the bubble says it in numbers. */
export function WeekBars({ title, days }: { title: string; days: { day: string; amount: number; note?: string }[] }) {
  const w = useCardW();
  const top = Math.max(...days.map(d => d.amount), 1);
  const best = days.reduce((m, d, i) => (d.amount > days[m].amount ? i : m), 0);
  const [pick, setPick] = useState(best);
  const MAX = 138;
  return (
    <Card w={w} h={268} fill={color.panel} pill={<T v="smallStrong" c={color.white}>{title}</T>}>
      <View style={r.chart}>
        <View style={r.bubbleRow}>
          <View style={r.bubble}><T v="smallStrong" style={r.nums}>{naira(days[pick].amount)}</T></View>
          <T v="small" c={color.onDark}>{days[pick].note ?? days[pick].day}</T>
        </View>
        <View style={r.bars}>
          {days.map((d, i) => (
            <Pressable
              key={d.day} accessibilityRole="button" accessibilityState={{ selected: i === pick }} accessibilityLabel={`${d.day}, ${d.amount} naira`}
              onPress={() => setPick(i)} style={r.col}
            >
              <Bar h={Math.max(10, (d.amount / top) * MAX)} on={i === pick} delay={i * motion.stagger} />
              <T v="tiny" c={i === pick ? color.white : color.onDark}>{d.day}</T>
            </Pressable>
          ))}
        </View>
      </View>
    </Card>
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
  chart: { flex: 1, paddingHorizontal: space.xl, paddingTop: 66, paddingBottom: space.lg, justifyContent: 'flex-end', gap: space.sm },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, position: 'absolute', top: space.xl, left: space.xl },
  bubble: { backgroundColor: color.panelHigh, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: space.sm, minHeight: 166 },
  bar: { width: 30, borderRadius: radius.sm },
  seg: { flexDirection: 'row', borderRadius: radius.md, padding: 0 },
  segItem: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: color.panelHigh },
});
