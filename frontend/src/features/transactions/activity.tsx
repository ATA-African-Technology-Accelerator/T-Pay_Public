import React, { useEffect, useState } from 'react';
import type { VoucherView } from '@tpay/shared/contracts/api';
import { Share, StyleSheet } from 'react-native';
import { Share2 } from 'lucide-react-native';
import { color, icon, motion, space } from '../../theme/tokens';
import { Button, HearIt, Panel, Rise, T, money, sayNaira, when } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { ActivityRows, Line, Segment } from '../../components/rows';
import { StatusMark } from '../../components/money';
import { useNav } from '../../nav';
import { statusOf, useApp } from '../../state/appState';
import { api } from '../../composition';
import { withSession } from '../../session/guard';
import { t } from '../../i18n';

type Filter = 'all' | 'in' | 'out' | 'pending';

/** ACT-11. Read from the phone first; the sync pass keeps it current. */
export function Activity() {
  const { history } = useApp();
  const [show, setShow] = useState<Filter>('all');
  const rows = history.filter(e => {
    if (show === 'all') return true;
    if (show === 'pending') return e.status === 'pending' || e.status === 'sent';
    if (show === 'in') return e.dir === 'in' || e.dir === 'release';
    return e.dir === 'out' || e.dir === 'withdraw' || e.dir === 'lock';
  });
  return (
    <Screen tabsFor="activity" head={<CurvedHeader home title={t.activity} />}>
      <Segment<Filter> value={show} onChange={setShow} options={[{ key: 'all', label: t.all }, { key: 'in', label: t.moneyInShort }, { key: 'out', label: t.moneyOutShort }, { key: 'pending', label: t.status.pending }]} />
      <Panel><ActivityRows key={show} rows={rows} /></Panel>
    </Screen>
  );
}

/** Every entry opens to one plain receipt. A settled payment shows its PayPal capture (FR-20). */
export function Receipt({ id }: { id: string }) {
  const nav = useNav();
  const { history, online } = useApp();
  const e = history.find(x => x.id === id);
  // For a payment between phones, ask T-Pay for its own record: the phone's copy can be behind.
  const [server, setServer] = useState<VoucherView | null>(null);
  const voucherId = e?.voucher?.voucherId ?? null;
  useEffect(() => {
    if (!voucherId || !online) return;
    let alive = true;
    void withSession(() => api.getVoucher(voucherId)).then(v => { if (alive) setServer(v); }).catch(() => undefined);
    return () => { alive = false; };
  }, [voucherId, online]);
  if (!e) return <Screen head={<CurvedHeader back bell={false} title={t.receipt} />}><T v="body" c={color.muted}>{t.nothingHere}</T></Screen>;
  const word = t.status[e.status];
  const mark = e.status === 'locked' ? 'sent' : e.status;
  const share = () => { Share.share({ message: `${t.receipt}: ${money(e.amount)}, ${word}. ${e.who}. ${when(e.at)}. ${t.reference} ${e.ref}${e.capture ? `. ${t.paypalCapture} ${e.capture}` : ''}` }).catch(() => undefined); };
  // An unconfirmed payment can show its code again, exactly as signed.
  const reopen = e.voucher && e.voucher.view === 'PAYER' && !e.voucher.receipt && e.status === 'sent';
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.receipt} />}
      footer={reopen
        ? <Button label={t.showSeller} onPress={() => nav.go({ name: 'voucher', voucherId: e.id })} />
        : <Button kind="soft" label={t.shareReceipt} icon={<Share2 size={icon.md} color={color.text} strokeWidth={1.8} />} onPress={share} />}
    >
      <Rise>
        <Panel style={s.top}>
          <StatusMark status={mark} size={44} />
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(e.amount)}</T>
          <T v="heading">{word}</T>
        </Panel>
      </Rise>
      <Rise delay={motion.stagger * 2}>
        <Panel>
          <Line label={e.dir === 'in' ? t.from : t.to} value={e.who} />
          <Line label={t.date} value={when(e.at)} />
          <Line label={t.reference} value={e.ref} mono />
          {e.capture && <Line label={e.voucher ? t.paypalCapture : t.paypalReference} value={e.capture} mono />}
          {server && <Line label={t.confirmedByTPay} value={t.status[statusOf(server.status)]} />}
          {server?.paypalCaptureId && !e.capture && <Line label={t.paypalCapture} value={server.paypalCaptureId} mono />}
        </Panel>
      </Rise>
      <HearIt say={`${word}. ${sayNaira(e.amount)}. ${e.who}`} />
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
});
