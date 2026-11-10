import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import type { LedgerEntry } from '@tpay/shared/contracts/api';
import { color, icon, motion, space } from '../../theme/tokens';
import { Button, HearIt, Panel, Rise, T, money, sayNaira, usd, when } from '../../components/ui';
import { CurvedHeader, Screen, Section } from '../../components/shell';
import { Line } from '../../components/rows';
import { StatusMark } from '../../components/money';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import { apiMessage, isCode } from '../errors';
import { refreshWallet } from '../../sync/syncCoordinator';
import { withdraw } from './walletActivities';

const word = (e: LedgerEntry) => ({ CREDIT: t.ledgerCredit, WITHDRAWAL: t.ledgerWithdrawal, REVERSAL: t.ledgerReversal, WITHDRAWAL_RETURNED: t.ledgerReturned })[e.type];
const out = (e: LedgerEntry) => e.type === 'WITHDRAWAL' || e.type === 'REVERSAL';

/** ACT-13. Collected money, each credit linked to its PayPal capture (FR-40). */
export function Ledger() {
  const nav = useNav();
  const { active, online } = useApp();
  useEffect(() => { if (online) void refreshWallet().catch(() => undefined); }, []);
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.walletActive} />} footer={<Button label={t.withdraw} disabled={!active.known || active.balanceUsd <= 0} onPress={() => nav.go({ name: 'withdraw' })} />}>
      <Panel style={s.big}>
        <T v="body" c={color.muted}>{t.moneyIn}</T>
        <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(active.balanceNgn)}</T>
        <T v="small" c={color.muted}>{active.known ? usd(active.balanceUsd) : t.neverUpdated}</T>
      </Panel>
      {active.pendingNgn > 0 && (
        <Panel style={s.line}>
          <T v="label">{t.status.pending}</T>
          <T v="label" c={color.amber}>{money(active.pendingNgn)}</T>
        </Panel>
      )}
      <Panel>
        <Section title={t.paidInList} />
        {active.entries.length === 0 && <T v="body" c={color.muted} style={s.center}>{t.nothingHere}</T>}
        {active.entries.map((e, i) => (
          <Rise key={e.entryId} delay={Math.min(i, 6) * motion.stagger}>
            <View style={s.entry} accessible accessibilityLabel={`${word(e)}, ${money(e.amountNgnMinor)}`}>
              <View style={{ flex: 1 }}>
                <T v="label">{word(e)}</T>
                <T v="small" c={color.muted}>{when(e.createdAt)}</T>
                {e.paypalCaptureId && <T v="tiny" c={color.muted} selectable>{e.paypalCaptureId}</T>}
              </View>
              <T v="label" c={out(e) ? color.text : color.green}>{`${out(e) ? '-' : '+'}${money(e.amountNgnMinor)}`}</T>
            </View>
          </Rise>
        ))}
      </Panel>
    </Screen>
  );
}

/** ACT-14. The whole balance goes to the account's PayPal email, once. */
export function Withdraw() {
  const nav = useNav();
  const { active, withdrawalOpen, withdrawal, online } = useApp();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => { if (online) void refreshWallet().catch(() => undefined); }, []);

  const go = async () => {
    setBusy(true); setProblem(null);
    try {
      const r = await withdraw(active.balanceUsd, active.balanceNgn);
      if (r.status === 'FAILED') setProblem(t.withdrawFailed); else setSent(true);
    } catch (e) {
      setProblem(isCode(e, 'INSUFFICIENT_BALANCE') ? t.insufficientBalance(money(active.balanceNgn)) : apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent || withdrawalOpen) {
    const amount = sent ? active.balanceNgn : withdrawal?.amountNgnMinor ?? 0;
    return (
      <Screen head={<CurvedHeader back bell={false} title={t.withdrawTitle} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
        <Rise>
          <Panel style={s.big}>
            <StatusMark status="pending" size={44} />
            <T v="title" style={s.center}>{t.withdrawPending}</T>
            {amount > 0 && <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(amount)}</T>}
            <T v="small" c={color.muted}>{active.payoutEmail}</T>
          </Panel>
        </Rise>
        <T v="body" c={color.muted} style={s.center}>{t.withdrawPendingNote}</T>
        <HearIt say={`${t.withdrawPending}. ${sayNaira(amount)}`} />
      </Screen>
    );
  }

  const empty = active.balanceUsd <= 0;
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.withdrawTitle} />}
      footer={<Button label={empty ? t.nothingToWithdraw : t.withdrawAll(money(active.balanceNgn))} disabled={empty || !online} loading={busy} onPress={() => { void go(); }} />}
    >
      <Panel style={s.big}>
        <T v="body" c={color.muted}>{t.availableNow}</T>
        <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(active.balanceNgn)}</T>
        <T v="small" c={color.muted}>{usd(active.balanceUsd)}</T>
      </Panel>
      <Panel>
        <Line label={t.withdrawTo} value={active.payoutEmail || '—'} />
      </Panel>
      {!online && <Problem text={t.needsInternet} />}
      {problem && <Problem text={problem} />}
      <T v="small" c={color.muted} style={s.center}>{t.withdrawNote}</T>
    </Screen>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <Panel style={s.problem}>
      <AlertCircle size={icon.md} color={color.coral} strokeWidth={1.8} />
      <T v="label" style={{ flex: 1 }} accessibilityLiveRegion="polite">{text}</T>
    </Panel>
  );
}

const s = StyleSheet.create({
  big: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  center: { textAlign: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
