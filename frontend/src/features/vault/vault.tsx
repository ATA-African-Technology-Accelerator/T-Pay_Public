import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import type { MeltVaultResponse } from '@tpay/shared/contracts/api';
import { color, icon, motion, space } from '../../theme/tokens';
import { Button, HearIt, Panel, Rise, RollingMoney, T, money, rate, sayNaira, usd, when } from '../../components/ui';
import { CurvedHeader, Screen, Section } from '../../components/shell';
import { ActivityRows, Duo, Line } from '../../components/rows';
import { StatusMark } from '../../components/money';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import type { PendingVault } from '../../adapters/storage/localStore';
import { apiMessage, isCode } from '../errors';
import { completeVault, meltVault, openApproval, startVault } from './vaultActivities';

function Problem({ text }: { text: string }) {
  return (
    <Panel style={v.problem}>
      <AlertCircle size={icon.md} color={color.coral} strokeWidth={1.8} />
      <T v="label" style={{ flex: 1 }} accessibilityLiveRegion="polite">{text}</T>
    </Panel>
  );
}

/** ACT-03. Everything shown comes from the vault certificate and the latest backend view. */
export function VaultScreen() {
  const nav = useNav();
  const { offline, history, vault } = useApp();
  const mine = history.filter(e => e.dir === 'out' && e.voucher?.voucher.payload.vaultId === vault?.vaultId);
  return (
    <Screen tabsFor="vault" head={<CurvedHeader home title={t.vaultTitle} />}>
      <Rise style={v.total}>
        <T v="body" c={color.muted}>{t.leftToSpend}</T>
        <RollingMoney value={offline.leftNgn} v="moneyL" />
        <T v="small" c={color.muted}>
          {!offline.open ? t.noVault : offline.canSpend ? t.spendByDate(when(offline.spendBy)) : offline.settleBy ? t.releaseByDate(when(offline.settleBy)) : t.spendingEnded}
        </T>
      </Rise>
      {offline.open && (
        <>
          <Duo items={[{ label: t.spent, value: money(offline.spentNgn) }, { label: t.waitingToFinish, value: money(offline.pendingOutNgn) }]} />
          <Panel>
            <Line label={t.lockedTotal} value={money(offline.lockedNgn)} />
            {offline.spendBy && <Line label={t.spendBy} value={when(offline.spendBy)} />}
            {offline.settleBy && <Line label={t.releaseBy} value={when(offline.settleBy)} />}
            {offline.fxRate && <Line label={t.demoRate} value={`${rate(offline.fxRate)} ${t.ngnPerUsd}`} />}
            {offline.authorizationId && <Line label={t.paypalHold} value={offline.authorizationId} mono />}
          </Panel>
        </>
      )}
      {offline.open && !offline.melted && <Button kind="soft" label={t.closeVault} onPress={() => nav.go({ name: 'melt' })} />}
      {!offline.open && <Button label={t.addMoney} onPress={() => nav.go({ name: 'amount', mode: 'lock' })} />}
      {offline.melted && offline.releaseAt && (
        <Panel>
          <T v="label">{t.stillHeld}</T>
          <T v="small" c={color.muted}>{`${t.stillHeldNote} ${t.releaseByDate(when(offline.releaseAt))}`}</T>
        </Panel>
      )}
      <Panel>
        <Section title={t.recentTx} action={t.seeAll} onAction={() => nav.reset({ name: 'activity' })} />
        <ActivityRows rows={mine.slice(0, 3)} />
      </Panel>
    </Screen>
  );
}

/**
 * ACT-04. Asks PayPal first, so the dollar amount and rate shown are the ones the
 * order will hold (FR-10). Then ACT-05: approve in PayPal and come back through tpay://.
 */
export function VaultReview({ amount, hours }: { amount: number; hours: number }) {
  const nav = useNav();
  const [order, setOrder] = useState<PendingVault | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const prepare = async () => {
    setProblem(null);
    try { setOrder(await startVault(amount, hours)); }
    catch (e) {
      if (isCode(e, 'ACTIVE_VAULT_EXISTS')) { nav.reset({ name: 'vault' }); return; }
      setProblem(apiMessage(e));
    }
  };
  useEffect(() => { if (!started.current) { started.current = true; void prepare(); } }, []);

  const approve = async () => {
    if (!order) return;
    setBusy(true); setProblem(null);
    try {
      const outcome = await openApproval(order);
      if (outcome === 'cancelled') { setProblem(t.paypalCancelled); setOrder(null); return; }
      if (outcome === 'dismissed') { setProblem(t.paypalNotFinished); return; }
      await completeVault(order.vaultId);
      nav.reset({ name: 'vaultActive' });
    } catch (e) {
      setProblem(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const footer = order
    ? <Button label={busy ? t.approving : t.toPayPal} loading={busy} onPress={() => { void approve(); }} />
    : problem ? <Button label={t.tryAgain} onPress={() => { void prepare(); }} /> : undefined;
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.checkVault} />} footer={footer}>
      <Rise>
        <Panel style={v.big}>
          <T v="body" c={color.muted}>{t.amountLock}</T>
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(amount)}</T>
          {order
            ? <T v="label">{`${t.paypalHolds} ${usd(order.amountUsdMinor)}`}</T>
            : !problem && <View style={v.row}><ActivityIndicator color={color.blue} /><T v="small" c={color.muted}>{t.preparing}</T></View>}
        </Panel>
      </Rise>
      {problem && <Problem text={problem} />}
      <Rise delay={motion.stagger * 2}>
        <Panel>
          {order && <Line label={t.demoRate} value={`${rate(order.fxRate)} ${t.ngnPerUsd}`} />}
          <Line label={t.spendWithin} value={`${hours} ${t.hours}`} />
          <Line label={t.unspentMoney} value={t.unspentReturns} />
        </Panel>
      </Rise>
      <T v="small" c={color.muted} style={v.center}>{t.sandboxNext}</T>
    </Screen>
  );
}

export function VaultActive() {
  const nav = useNav();
  const { offline } = useApp();
  return (
    <Screen head={<CurvedHeader bell={false} title={t.vaultLocked} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
      <Rise>
        <Panel style={v.big}>
          <StatusMark status="paid" size={44} big />
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(offline.lockedNgn)}</T>
          <T v="label">{t.heldByPayPal}</T>
          {offline.spendBy && <T v="small" c={color.muted}>{t.spendByDate(when(offline.spendBy))}</T>}
        </Panel>
      </Rise>
      <T v="body" c={color.muted} style={v.center}>{t.canGoOffline}</T>
      <HearIt say={`${t.vaultLocked}. ${sayNaira(offline.lockedNgn)}. ${t.canGoOffline}`} />
    </Screen>
  );
}

/** ACT-12. Unspent money goes back to PayPal; money owed to sellers stays held until it settles. */
export function Melt() {
  const nav = useNav();
  const { offline } = useApp();
  const [done, setDone] = useState<MeltVaultResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const before = useRef({ left: offline.leftNgn, pending: offline.pendingOutNgn });

  const close = async () => {
    setBusy(true); setProblem(null);
    before.current = { left: offline.leftNgn, pending: offline.pendingOutNgn };
    try { setDone(await meltVault()); }
    catch (e) { setProblem(apiMessage(e)); }
    finally { setBusy(false); }
  };

  if (done) {
    const released = done.status === 'CLOSED';
    return (
      <Screen head={<CurvedHeader bell={false} title={t.vaultClosed} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
        <Rise>
          <Panel style={v.big}>
            <StatusMark status={released ? 'paid' : 'pending'} size={44} />
            <T v="title" style={v.center}>{t.backToPayPal}</T>
            <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(before.current.left)}</T>
          </Panel>
        </Rise>
        {!released && (
          <Rise delay={motion.stagger * 2}>
            <Panel>
              <Line label={t.stillHeld} value={money(before.current.pending)} />
              {done.releaseScheduledFor && <Line label={t.releaseBy} value={when(done.releaseScheduledFor)} />}
              {done.blockingVoucherIds.length > 0 && <Line label={t.waitingFor} value={done.blockingVoucherIds.join(', ')} mono />}
            </Panel>
            <T v="small" c={color.muted}>{t.stillHeldNote}</T>
          </Rise>
        )}
      </Screen>
    );
  }
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.closeVault} />} footer={<Button label={busy ? t.closing : t.closeVault} loading={busy} onPress={() => { void close(); }} />}>
      <T v="hello">{t.stopSpending}</T>
      <Panel>
        <Line label={t.unspent} value={money(offline.leftNgn)} strong />
        <Line label={t.status.pending} value={money(offline.pendingOutNgn)} />
        <Line label={t.unspentMoney} value={t.unspentReturns} />
      </Panel>
      {problem && <Problem text={problem} />}
      <T v="body" c={color.muted}>{t.closeNote}</T>
    </Screen>
  );
}

const v = StyleSheet.create({
  total: { alignItems: 'center', paddingVertical: space.xs, gap: space.hair },
  big: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
