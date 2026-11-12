import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import type { MeltVaultResponse } from '@tpay/shared/contracts/api';
import { color, icon, motion, space } from '../../theme/tokens';
import { Button, HearIt, Panel, Rise, RollingMoney, T, money, rate, sayNaira, speakNaturally, usd, when } from '../../components/ui';
import { CurvedHeader, Screen, Section } from '../../components/shell';
import { ActivityRows, Duo, Line } from '../../components/rows';
import { StatusMark } from '../../components/money';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import type { PendingVault } from '../../adapters/storage/localStore';
import { apiMessage, isCode } from '../errors';
import { completeVault, lockFromWallet, meltVault, openApproval, startVault } from './vaultActivities';
import { useCashOut, useTopUp } from './topUp';
import { ConfirmPin } from '../onboarding/lock';
import { payHelp } from '../assistant/help';
import { convertNgnToUsd } from '@tpay/shared/domain/convertNgnToUsd';
import { Money } from '@tpay/shared/shared/domain/Money';

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
  const topUp = useTopUp();
  const cashOut = useCashOut();
  return (
    <Screen tabsFor="vault" head={<CurvedHeader home title={t.vaultTitle} />}>
      <Rise style={v.total}>
        <T v="body" c={color.muted}>{t.leftToSpend}</T>
        <RollingMoney value={offline.leftNgn} v="moneyL" />
        <T v="small" c={color.muted}>
          {!offline.open ? t.noVault : offline.canSpend ? t.spendByDate(when(offline.spendBy)) : offline.settleBy ? t.releaseByDate(when(offline.settleBy)) : t.spendingEnded}
        </T>
      </Rise>
      {/* Always shown. With nothing to pay from, the assistant says why and offers to lock money. */}
      <Button kind={offline.canSpend ? 'solid' : 'soft'} label={t.pay} onPress={() => nav.go(offline.canSpend ? { name: 'scan', kind: 'request' } : payHelp())} />
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
      {!offline.open && topUp.kobo > 0 && (
        <Panel style={v.gap}>
          <T v="label">{t.topUpTitle(money(topUp.kobo))}</T>
          <T v="small" c={color.muted}>{t.topUpNote}</T>
          <Button label={t.lockShort} onPress={() => nav.go({ name: 'amount', mode: 'lock', prefill: topUp.kobo })} />
          <Button kind="quiet" label={t.notNow} onPress={() => { void topUp.dismiss(); }} />
        </Panel>
      )}
      <Panel style={v.gap}>
        {offline.incomingNgn > 0 ? (
          <>
            <T v="label">{t.receivedOffline(money(offline.incomingNgn))}</T>
            <T v="small" c={color.muted}>{cashOut ? t.receivedQueuedCashOut : t.receivedQueuedNote}</T>
          </>
        ) : <T v="small" c={color.muted}>{t.receiveHere}</T>}
        <Button kind="soft" label={t.getPaid} onPress={() => nav.go({ name: 'amount', mode: 'collect' })} />
      </Panel>
      {offline.open && !offline.melted && <Button kind="soft" label={t.closeVault} onPress={() => nav.go({ name: 'melt' })} />}
      {!offline.open && !topUp.kobo && <Button label={t.addMoney} onPress={() => nav.go({ name: 'amount', mode: 'lock' })} />}
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
export function VaultReview({ amount, hours, handsFree = false }: { amount: number; hours: number; handsFree?: boolean }) {
  const nav = useNav();
  const { active, online } = useApp();
  const [order, setOrder] = useState<PendingVault | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(randomKey());
  // The money is already in the Wallet, so locking from it needs no PayPal step.
  const need = convertNgnToUsd(Money.fromMinor(amount, 'NGN').getValue(), active.fxRate || '1500.00').getValue().minor;
  const covered = online && active.known && active.balanceUsd >= need && active.balanceNgn >= amount;
  const [viaPayPal, setViaPayPal] = useState(!covered);
  const started = useRef(false);
  // Asked by voice, locking from the Wallet still needs the PIN or fingerprint, and locking with
  // PayPal still needs the PayPal sign-in. The assistant only opens them.
  const [asking, setAsking] = useState(false);
  const spoke = useRef(false);

  const prepare = async () => {
    setProblem(null);
    try { setOrder(await startVault(amount, hours)); }
    catch (e) {
      if (isCode(e, 'ACTIVE_VAULT_EXISTS')) { nav.reset({ name: 'vault' }); return; }
      setProblem(apiMessage(e));
    }
  };
  useEffect(() => { if (viaPayPal && !started.current) { started.current = true; void prepare(); } }, [viaPayPal]);

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

  const fromWallet = async () => {
    setBusy(true); setProblem(null);
    try {
      await lockFromWallet(amount, hours, key.current);
      nav.reset({ name: 'vaultActive' });
    } catch (e) {
      if (isCode(e, 'ACTIVE_VAULT_EXISTS')) { nav.reset({ name: 'vault' }); return; }
      setProblem(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!handsFree || spoke.current) return;
    if (!viaPayPal) {
      spoke.current = true;
      void speakNaturally(t.confirmToLock).then(() => setAsking(true));
    } else if (order) {
      spoke.current = true;
      void speakNaturally(t.signInPayPal).then(() => { void approve(); });
    }
  }, [order, viaPayPal]);

  if (asking) {
    return <ConfirmPin heading={`${t.lockFromWallet} · ${money(amount)}`} offerFingerprint onCancel={() => setAsking(false)} onConfirmed={() => { setAsking(false); void fromWallet(); }} />;
  }

  const footer = !viaPayPal
    ? (
      <View style={{ gap: space.sm }}>
        <Button label={busy ? t.locking : t.lockFromWallet} loading={busy} onPress={() => { void fromWallet(); }} />
        <Button kind="quiet" label={t.usePayPalInstead} disabled={busy} onPress={() => setViaPayPal(true)} />
      </View>
    )
    : order
      ? <Button label={busy ? t.approving : t.toPayPal} loading={busy} onPress={() => { void approve(); }} />
      : problem ? <Button label={t.tryAgain} onPress={() => { void prepare(); }} /> : undefined;
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.checkVault} />} footer={footer}>
      <Rise>
        <Panel style={v.big}>
          <T v="body" c={color.muted}>{t.amountLock}</T>
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(amount)}</T>
          {!viaPayPal
            ? <T v="label">{t.fromWalletTitle}</T>
            : order
              ? <T v="label">{`${t.paypalHolds} ${usd(order.amountUsdMinor)}`}</T>
              : !problem && <View style={v.row}><ActivityIndicator color={color.blue} /><T v="small" c={color.muted}>{t.preparing}</T></View>}
        </Panel>
      </Rise>
      {problem && <Problem text={problem} />}
      {viaPayPal && !covered && active.known && (
        <Panel style={v.row}>
          <T v="small" style={{ flex: 1 }}>{t.walletShort(money(active.balanceNgn))}</T>
          <Button kind="soft" label={t.addMoneyFirst} onPress={() => nav.go({ name: 'addMoney' })} />
        </Panel>
      )}
      <Rise delay={motion.stagger * 2}>
        <Panel>
          {!viaPayPal && <Line label={t.walletActive} value={t.fromWalletNote(money(active.balanceNgn - amount))} />}
          {viaPayPal && order && <Line label={t.demoRate} value={`${rate(order.fxRate)} ${t.ngnPerUsd}`} />}
          <Line label={t.spendWithin} value={`${hours} ${t.hours}`} />
          <Line label={t.unspentMoney} value={viaPayPal ? t.unspentReturns : t.unspentToWallet} />
        </Panel>
      </Rise>
      {viaPayPal && <T v="small" c={color.muted} style={v.center}>{t.sandboxNext}</T>}
    </Screen>
  );
}

/** A fresh idempotency key for one lock attempt; a retry of the same attempt reuses it. */
function randomKey(): string {
  return `lock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function VaultActive() {
  const nav = useNav();
  const { offline, vault } = useApp();
  const fromWallet = vault?.view?.fundedBy === 'WALLET';
  return (
    <Screen head={<CurvedHeader bell={false} title={t.vaultLocked} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
      <Rise>
        <Panel style={v.big}>
          <StatusMark status="paid" size={44} big />
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(offline.lockedNgn)}</T>
          <T v="label">{fromWallet ? t.lockedFromWallet : t.heldByPayPal}</T>
          {offline.spendBy && <T v="small" c={color.muted}>{t.spendByDate(when(offline.spendBy))}</T>}
        </Panel>
      </Rise>
      <T v="body" c={color.muted} style={v.center}>{t.canGoOffline}</T>
      <HearIt auto say={`${t.vaultLocked}. ${sayNaira(offline.lockedNgn)}. ${t.canGoOffline}`} />
    </Screen>
  );
}

/** ACT-12. Unspent money goes back to PayPal; money owed to sellers stays held until it settles. */
export function Melt({ handsFree = false }: { handsFree?: boolean }) {
  const nav = useNav();
  const { offline, vault } = useApp();
  const backTo = vault?.view?.fundedBy === 'WALLET' ? t.unspentToWallet : t.unspentReturns;
  const [done, setDone] = useState<MeltVaultResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const before = useRef({ left: offline.leftNgn, pending: offline.pendingOutNgn });
  // Closing gives the unspent part back, so it asks for the PIN or fingerprint first, like
  // sending money. Money already paid out stays locked for the people holding it either way.
  const [asking, setAsking] = useState(false);
  // Asked by voice: say what happens, then open the fingerprint (the person still has to give it).
  useEffect(() => {
    if (!handsFree) return;
    let gone = false;
    void speakNaturally(t.confirmToUnlock).then(() => { if (!gone) setAsking(true); });
    return () => { gone = true; };
  }, []);

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
  if (asking) {
    return <ConfirmPin heading={t.stopSpending} offerFingerprint={handsFree} onCancel={() => setAsking(false)} onConfirmed={() => { setAsking(false); void close(); }} />;
  }
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.closeVault} />} footer={<Button label={busy ? t.closing : t.closeVault} loading={busy} onPress={() => setAsking(true)} />}>
      <T v="hello">{t.stopSpending}</T>
      <Panel>
        <Line label={t.unspent} value={money(offline.leftNgn)} strong />
        <Line label={t.status.pending} value={money(offline.pendingOutNgn)} />
        <Line label={t.unspentMoney} value={backTo} />
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
  gap: { gap: space.sm },
});
