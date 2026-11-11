import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDown, ArrowUp, Banknote, Cpu, Landmark, Lock, Plus, ReceiptText, WifiOff } from 'lucide-react-native';
import { color, icon, motion, radius, space } from '../../theme/tokens';
import { Button, Panel, Press, Rise, T, money, when } from '../../components/ui';
import { Screen, Section } from '../../components/shell';
import { Hero, type HeroAction, type WalletPage } from '../../components/hero';
import { ActivityRows } from '../../components/rows';
import { useNav } from '../../nav';
import { useApp, type Entry } from '../../state/appState';
import { store } from '../../composition';
import { useModelState } from '../settings/offlineAssistant';
import { t } from '../../i18n';

const ic = { size: icon.md, color: color.white, strokeWidth: 1.8 };
const mark = { size: icon.md, color: color.icon, strokeWidth: 1.8 };

function Rows({ rows }: { rows: Entry[] }) {
  const nav = useNav();
  return (
    <Panel>
      <Section title={t.recentTx} action={t.seeAll} onAction={() => nav.reset({ name: 'activity' })} />
      <ActivityRows rows={rows.slice(0, 4)} />
    </Panel>
  );
}

function Notice({ icon: glyph, title, note, onPress }: { icon: React.ReactNode; title: string; note: string; onPress?(): void }) {
  const body = (
    <>
      <View style={h.noticeMark}>{glyph}</View>
      <View style={{ flex: 1 }}>
        <T v="label">{title}</T>
        <T v="small" c={color.muted}>{note}</T>
      </View>
    </>
  );
  return onPress
    ? <Press accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={h.notice}>{body}</Press>
    : <View style={h.notice} accessible>{body}</View>;
}

const AI_OFFER_DISMISSED = 'ui.aiOfferDismissed';
let openedOnMain = false;

/**
 * A one-time, optional offer on Home: the offline assistant is a big download, so people see it
 * and choose. Only phones that can run it see it, and "Not now" hides it for good (Settings keeps it).
 */
function OfflineAiOffer() {
  const nav = useNav();
  const model = useModelState();
  const [dismissed, setDismissed] = React.useState(true);
  React.useEffect(() => { void store.getMeta<boolean>(AI_OFFER_DISMISSED).then(v => setDismissed(!!v)).catch(() => setDismissed(false)); }, []);
  if (dismissed || model.kind !== 'absent') return null;
  return (
    <Panel>
      <View style={h.offer}>
        <View style={h.noticeMark}><Cpu {...mark} /></View>
        <View style={{ flex: 1 }}>
          <T v="label">{t.offlineAiOfferTitle}</T>
          <T v="small" c={color.muted}>{`${t.offlineAiIntro} ${t.offlineAiOptional}`}</T>
        </View>
      </View>
      <View style={h.offer}>
        <Button style={{ flex: 1 }} kind="quiet" label={t.notNow} onPress={() => { setDismissed(true); void store.setMeta(AI_OFFER_DISMISSED, true); }} />
        <Button style={{ flex: 1 }} kind="soft" label={t.offlineAiSee} onPress={() => nav.go({ name: 'offlineAi' })} />
      </View>
    </Panel>
  );
}

/** One home for everyone. The same person pays from the Offline vault and collects into the Main wallet. */
export function HomeScreen() {
  const nav = useNav();
  const { name, offline, active, history, wallet, setWallet, pendingVault, withdrawal, withdrawalOpen, online, lastSyncAt, sync, accountKind, vault: lockedVault } = useApp();
  const business = accountKind === 'business';
  // Home is where people look for news, so it asks for it: right after setup and each unlock.
  React.useEffect(() => { void sync(); }, []);
  // A business gets paid into the main wallet, so that is the page it opens on, once per visit to the app.
  React.useEffect(() => { if (business && !openedOnMain) { openedOnMain = true; setWallet('active'); } }, [business]);
  const lockMoney = () => nav.go({ name: 'amount', mode: 'lock' });
  const pay: HeroAction = { label: t.pay, icon: <ArrowUp {...ic} />, onPress: () => nav.go({ name: 'scan', kind: 'request' }) };
  const receive: HeroAction = { label: business ? t.getPaid : t.receive, icon: <ArrowDown {...ic} />, onPress: () => nav.go({ name: 'amount', mode: 'collect' }) };
  const lock: HeroAction = { label: t.lockShort, icon: <Plus {...ic} />, onPress: lockMoney };
  const vault: HeroAction = { label: t.vault, icon: <Lock {...ic} />, onPress: () => nav.reset({ name: 'vault' }) };
  const activity: HeroAction = { label: t.activity, icon: <ReceiptText {...ic} />, onPress: () => nav.reset({ name: 'activity' }) };
  const addMoney: HeroAction = { label: t.depositShort, icon: <Plus {...ic} />, onPress: () => nav.go({ name: 'addMoney' }) };
  const withdraw: HeroAction = { label: t.withdraw, icon: <Banknote {...ic} />, onPress: () => nav.go({ name: 'withdraw' }) };
  const received: HeroAction = { label: t.received, icon: <Landmark {...ic} />, onPress: () => nav.go({ name: 'ledger' }) };

  // The Offline vault only locks and sends money. Money people receive lands in the Main
  // wallet: a payment taken offline shows there as coming in until the phone syncs.
  // Lock money only while no vault is open: the backend allows one (decision 8).
  const offlineActions = offline.canSpend ? [pay, vault, activity] : offline.open ? [vault, activity] : [lock, activity];
  const comingIn = active.pendingNgn + offline.incomingNgn;
  const pages: WalletPage[] = [
    {
      key: 'offline', name: t.walletOffline, label: t.canSpend, amount: offline.leftNgn, actions: offlineActions,
      note: offline.pendingOutNgn ? `${money(offline.pendingOutNgn)} ${t.onTheWay}` : '',
      status: offline.canSpend ? t.readyOffline : offline.open ? t.spendingEnded : t.noVault,
    },
    {
      key: 'active', name: t.walletActive, label: t.availableNow, amount: active.balanceNgn,
      actions: business ? [receive, received, withdraw, addMoney] : [receive, addMoney, withdraw, received],
      note: comingIn ? `${money(comingIn)} ${t.comingIn}` : '',
      status: business ? t.readyToCollect : active.payoutEmail || t.collected,
    },
  ];

  const isActive = wallet === 'active';
  const linkNotice = <Notice icon={<Landmark {...mark} />} title={t.shareLinkTitle} note={t.shareLinkNote} onPress={() => nav.go({ name: 'ledger' })} />;
  const offlineNotice = pendingVault && !offline.open
    ? <Notice icon={<Lock {...mark} />} title={t.finishLock} note={t.finishLockHint} onPress={() => nav.go({ name: 'vaultReview', amount: pendingVault.amountNgnMinor, hours: pendingVault.durationHours })} />
    : !offline.open
      ? <Notice icon={<Lock {...mark} />} title={t.noVault} note={t.noVaultHint} onPress={lockMoney} />
      : offline.canSpend
        ? <Notice icon={<Lock {...mark} />} title={`${money(offline.lockedNgn)} ${lockedVault?.view?.fundedBy === 'WALLET' ? t.lockedFromWallet : t.heldByPayPal}`} note={t.spendByDate(when(offline.spendBy))} onPress={() => nav.reset({ name: 'vault' })} />
        : <Notice icon={<Lock {...mark} />} title={offline.melted ? t.stillHeld : t.spendingEnded} note={offline.melted && offline.settleBy ? t.releaseByDate(when(offline.releaseAt ?? offline.settleBy)) : t.autoClosing} onPress={() => nav.reset({ name: 'vault' })} />;
  const activeNotice = !active.known
    ? <Notice icon={<WifiOff {...mark} />} title={t.walletActive} note={t.neverUpdated} />
    : withdrawalOpen
      ? <Notice icon={<Banknote {...mark} />} title={t.withdrawPending} note={t.withdrawalOnWay(withdrawal?.recipientEmail ?? active.payoutEmail)} />
      : business
        ? linkNotice
        : <Notice icon={<Banknote {...mark} />} title={t.withdrawTitle} note={t.withdrawAnyTime} onPress={() => nav.go({ name: 'withdraw' })} />;

  return (
    <Screen tabsFor="home" hero={<Hero name={name} pages={pages} wallet={wallet} onWallet={setWallet} />}>
      {!online && <Notice icon={<WifiOff {...mark} />} title={t.noNetwork} note={lastSyncAt ? `${t.offlineNow} ${t.updatedAt(when(lastSyncAt, false))}` : t.offlineNow} />}
      <Rise key={wallet}>{isActive ? activeNotice : offlineNotice}</Rise>
      <OfflineAiOffer />
      <Rise delay={motion.stagger * 2}>
        <Rows key={wallet} rows={isActive ? history.filter(e => e.dir === 'in' || e.dir === 'withdraw') : history} />
      </Rise>
    </Screen>
  );
}

const h = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, backgroundColor: color.panel, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg },
  offer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  noticeMark: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: color.panelHigh, alignItems: 'center', justifyContent: 'center' },
});
