import React from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { color, icon, motion, space } from '../theme/tokens';
import { Button, HearIt, Panel, Rise, T, money } from '../components/ui';
import { CurvedHeader, Screen } from '../components/shell';
import { StatusMark } from '../components/money';
import { useStore } from '../demo/store';
import { t } from '../i18n/en';

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={r.line} accessible accessibilityLabel={`${label}, ${value}`}>
      <T v="body" c={color.muted}>{label}</T>
      <T v="label" style={[r.value, mono && r.mono]}>{value}</T>
    </View>
  );
}

/** Every transaction opens to one plain receipt. Only a paid entry shows a PayPal capture. */
export function Receipt({ id }: { id: string }) {
  const { history } = useStore();
  const e = history.find(x => x.id === id);
  if (!e) return <Screen head={<CurvedHeader back bell={false} title={t.receipt} />}><T v="body" c={color.muted}>{t.nothingHere}</T></Screen>;
  const word = t.status[e.status];
  const mark = e.status === 'locked' ? 'sent' : e.status;
  const share = () => { Share.share({ message: `${t.receipt}: ${money(e.amount)}, ${word}. ${e.who}. ${e.when}. ${t.reference} ${e.ref}` }).catch(() => {}); };
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.receipt} />}
      footer={<Button kind="soft" label={t.shareReceipt} icon={<Share2 size={icon.md} color={color.text} strokeWidth={1.8} />} onPress={share} />}
    >
      <Rise>
        <Panel style={r.top}>
          <StatusMark status={mark} size={44} />
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(e.amount)}</T>
          <T v="heading">{word}</T>
        </Panel>
      </Rise>
      <Rise delay={motion.stagger * 2}>
        <Panel>
          <Line label={e.dir === 'in' ? t.from : t.to} value={e.who} />
          <Line label={t.date} value={e.when} />
          <Line label={t.reference} value={e.ref} mono />
          {e.capture && <Line label={t.paypalCapture} value={e.capture} mono />}
        </Panel>
      </Rise>
      <HearIt say={`${word}. ${e.amount} naira. ${e.who}`} />
    </Screen>
  );
}

const r = StyleSheet.create({
  top: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg, paddingVertical: space.hair },
  value: { flexShrink: 1, textAlign: 'right' },
  mono: { fontVariant: ['tabular-nums'] },
});
