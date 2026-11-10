import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { color, icon, motion, space } from '../theme/tokens';
import { Button, HearIt, Panel, Rise, RollingMoney, T, money } from '../components/ui';
import { CurvedHeader, Screen, Section } from '../components/shell';
import { ActivityRows, Duo, WeekBars } from '../components/rows';
import { StatusMark } from '../components/money';
import { useNav } from '../nav';
import { DEMO_RATE, SPENT, useStore } from '../demo/store';
import { t } from '../i18n/en';

const up = <ArrowUp size={icon.md} color={color.ink} strokeWidth={2} />;
const down = <ArrowDown size={icon.md} color={color.ink} strokeWidth={2} />;
const usd = (n: number) => `$${(n / DEMO_RATE).toFixed(2)}`;

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={v.line} accessible accessibilityLabel={`${label}, ${value}`}>
      <T v="body" c={color.muted}>{label}</T>
      <T v={strong ? 'heading' : 'label'} style={v.value}>{value}</T>
    </View>
  );
}

export function VaultScreen() {
  const nav = useNav();
  const { left, pending, locked, history } = useStore();
  return (
    <Screen tabsFor="vault" head={<CurvedHeader home title={t.vaultTitle} />}>
      <Rise style={v.total}>
        <T v="body" c={color.muted}>{t.leftToSpend}</T>
        <RollingMoney value={left} v="moneyL" />
        <T v="small" c={color.muted}>{t.spendBy}</T>
      </Rise>
      <Rise delay={motion.stagger * 2}>
        <WeekBars title={t.spendDays} days={[
          { day: 'Thu', amount: 1000 }, { day: 'Fri', amount: 1500 }, { day: 'Sat', amount: 2000 },
          { day: 'Sun', amount: 3300, note: t.today }, { day: 'Mon', amount: 0, note: t.lastDay },
        ]} />
      </Rise>
      <Duo items={[
        { label: t.spent, value: money(SPENT), fill: color.green, icon: up },
        { label: t.status.pending, value: money(pending), fill: color.amber, icon: down },
      ]} />
      <Button label={t.addMoney} onPress={() => nav.go({ name: 'amount', mode: 'lock' })} />
      {locked > 0 && <Button kind="soft" label={t.closeVault} onPress={() => nav.go({ name: 'melt' })} />}
      <Panel>
        <Section title={t.recentTx} action={t.seeAll} onAction={() => nav.reset({ name: 'activity' })} />
        <ActivityRows rows={history.filter(e => e.dir !== 'in').slice(0, 2)} />
      </Panel>
    </Screen>
  );
}

export function VaultReview({ amount, hours }: { amount: number; hours: number }) {
  const nav = useNav();
  const { lock } = useStore();
  const [busy, setBusy] = React.useState(false);
  const go = async () => { setBusy(true); await lock(amount); nav.reset({ name: 'vaultActive', amount, hours }); };
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.checkVault} />} footer={<Button label={t.toPayPal} loading={busy} onPress={go} />}>
      <Rise>
        <Panel style={v.big}>
          <T v="body" c={color.muted}>{t.amountLock}</T>
          <T v="moneyL">{money(amount)}</T>
          <T v="label">{`${t.paypalHolds} ${usd(amount)}`}</T>
        </Panel>
      </Rise>
      <Rise delay={motion.stagger * 2}>
        <Panel>
          <Line label={t.demoRate} value={`₦${DEMO_RATE.toLocaleString('en-US')}.00 ${t.ngnPerUsd}`} />
          <Line label={t.spendWithin} value={`${hours} ${t.hours}`} />
          <Line label={t.unspentMoney} value={t.unspentReturns} />
        </Panel>
      </Rise>
      <T v="small" c={color.muted} style={v.center}>{t.sandboxNext}</T>
    </Screen>
  );
}

export function VaultActive({ amount, hours }: { amount: number; hours: number }) {
  const nav = useNav();
  return (
    <Screen head={<CurvedHeader bell={false} title={t.vaultLocked} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
      <Rise>
        <Panel style={v.big}>
          <StatusMark status="paid" size={44} big />
          <T v="moneyL">{money(amount)}</T>
          <T v="label">{`${usd(amount)} ${t.heldByPayPal}`}</T>
          <T v="small" c={color.muted}>{`${t.spendWithin} ${hours} ${t.hours}`}</T>
        </Panel>
      </Rise>
      <T v="body" c={color.muted} style={v.center}>{t.canGoOffline}</T>
      <HearIt say={`${t.vaultLocked}. ${amount} naira. ${t.canGoOffline}`} />
    </Screen>
  );
}

/** Close the vault. Unspent money returns now; money promised to sellers stays held until it settles. */
export function Melt() {
  const nav = useNav();
  const { left, pending, melt, blocking } = useStore();
  const [done, setDone] = React.useState<null | { back: number; held: number; ref?: string }>(null);
  const [busy, setBusy] = React.useState(false);
  const close = async () => { setBusy(true); const after = { back: left, held: pending, ref: blocking?.ref }; await melt(); setDone(after); };
  if (done) {
    return (
      <Screen head={<CurvedHeader bell={false} title={t.vaultClosed} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
        <Rise>
          <Panel style={v.big}>
            <StatusMark status={done.held ? 'pending' : 'paid'} size={44} />
            <T v="title">{t.backToActive}</T>
            <T v="moneyL">{money(done.back)}</T>
          </Panel>
        </Rise>
        {done.held > 0 && (
          <Rise delay={motion.stagger * 2}>
            <Panel>
              <Line label={t.stillHeld} value={money(done.held)} />
              <Line label={t.releaseBy} value={t.settleByDate} />
              {done.ref && <Line label={t.waitingFor} value={done.ref} />}
            </Panel>
          </Rise>
        )}
      </Screen>
    );
  }
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.closeVault} />} footer={<Button label={t.closeVault} loading={busy} onPress={close} />}>
      <T v="hello">{t.stopSpending}</T>
      <Panel>
        <Line label={t.unspent} value={money(left)} strong />
        <Line label={t.status.pending} value={money(pending)} />
      </Panel>
      <T v="body" c={color.muted}>{t.closeNote}</T>
    </Screen>
  );
}

const v = StyleSheet.create({
  total: { alignItems: 'center', paddingVertical: space.xs, gap: space.hair },
  big: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  center: { textAlign: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  value: { flexShrink: 1, textAlign: 'right' },
});
