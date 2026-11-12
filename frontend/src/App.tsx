import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Signal, Wifi, BatteryFull } from 'lucide-react-native';
import { color, font, icon, layout, motion, radius, space, shadow } from './theme/tokens';
import { T, native, useReduceMotion } from './components/ui';
import { Nav, NavCtx, Route } from './nav';
import { OPEN_ROUTES, stackAfterReset } from './navStack';
import { Linking } from 'react-native';
import { AppStateProvider, type HistoryWords } from './state/appState';
import { Details, Language, Splash } from './features/onboarding/onboarding';
import { CreatePin, Lock } from './features/onboarding/lock';
import { HomeScreen } from './features/home/home';
import { Amount } from './features/payment/amount';
import { Scan } from './features/payment/scan';
import { Credit, Request, endMerchantSession } from './features/payment/merchant';
import { Delivered, Review, Voucher } from './features/payment/customer';
import { Refusal } from './features/payment/refusal';
import { closeLink } from './features/payment/link';
import { Melt, VaultActive, VaultReview, VaultScreen } from './features/vault/vault';
import { completeVault, readReturn } from './features/vault/vaultActivities';
import { Activity, Receipt } from './features/transactions/activity';
import { Ledger, Withdraw } from './features/ledger/ledger';
import { AddMoney } from './features/ledger/addMoney';
import { completeDeposit, readDepositReturn } from './features/ledger/walletActivities';
import { Assist, ProposalScreen, Speak } from './features/assistant/speak';
import { SettingsScreen } from './features/settings/settings';
import { Help } from './features/settings/help';
import { Stock } from './features/business/stock';
import { Budget } from './features/business/budget';
import { OfflineAssistant } from './features/settings/offlineAssistant';
import { SideMenu } from './components/menu';
import { ArrivalBanner } from './components/arrivalBanner';
import { KeepBluetoothOn } from './features/business/keepBluetoothOn';
import { api, appLock, speechOut } from './composition';
import { config } from './config';
import { catalogueLanguage, t } from './i18n';
import { onRevoked } from './session/guard';
import { onDoubleVolumeUp } from '../modules/tpay-volume';
import { startSync } from './sync/syncCoordinator';

// Like a bank app: away for longer than this and the PIN is needed again.
const RELOCK_AFTER_MS = 60_000;

function render(r: Route) {
  switch (r.name) {
    case 'splash': return <Splash />;
    case 'language': return <Language edit={r.edit} />;
    case 'details': return <Details edit={r.edit} />;
    case 'createPin': return <CreatePin />;
    case 'lock': return <Lock />;
    case 'home': return <HomeScreen />;
    case 'activity': return <Activity />;
    case 'receipt': return <Receipt id={r.id} />;
    case 'vault': return <VaultScreen />;
    case 'amount': return <Amount mode={r.mode} prefill={r.prefill} />;
    case 'vaultReview': return <VaultReview amount={r.amount} hours={r.hours} />;
    case 'vaultActive': return <VaultActive />;
    case 'melt': return <Melt />;
    case 'request': return <Request amount={r.amount} handsFree={r.handsFree} />;
    case 'scan': return <Scan route={r} />;
    case 'review': return <Review scanned={r.scanned} expected={r.expected} handsFree={r.handsFree} />;
    case 'voucher': return <Voucher voucherId={r.voucherId} />;
    case 'delivered': return <Delivered voucherId={r.voucherId} />;
    case 'credit': return <Credit voucherId={r.voucherId} bluetooth={r.bluetooth} again={r.again} />;
    case 'refusal': return <Refusal code={r.code} side={r.side} amount={r.amount} existingId={r.existingId} />;
    case 'ledger': return <Ledger />;
    case 'withdraw': return <Withdraw />;
    case 'addMoney': return <AddMoney />;
    case 'speak': return <Speak auto={r.auto} attempt={r.attempt} />;
    case 'proposal': return <ProposalScreen proposal={r.proposal} handsFree={r.handsFree} attempt={r.attempt} />;
    case 'assist': return <Assist />;
    case 'settings': return <SettingsScreen />;
    case 'help': return <Help />;
    case 'offlineAi': return <OfflineAssistant />;
    case 'stock': return <Stock />;
    case 'budget': return <Budget />;
  }
}

function Page({ route, dir }: { route: Route; dir: number }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: motion.base, easing: motion.ease.out, useNativeDriver: native }).start();
  }, []);
  const translateX = a.interpolate({ inputRange: [0, 1], outputRange: [reduce ? 0 : 20 * dir, 0] });
  return <Animated.View style={[StyleSheet.absoluteFill, { opacity: a, transform: [{ translateX }] }]}>{render(route)}</Animated.View>;
}

export default function App() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [stack, setStack] = useState<{ r: Route; id: number; dir: number }[]>([{ r: { name: 'splash' }, id: 0, dir: 0 }]);
  const [menu, setMenu] = useState(false);
  const ids = useRef(1);
  const nav = useMemo<Nav>(() => ({
    go: r => setStack(s => [...s, { r, id: ids.current++, dir: 1 }]),
    reset: r => {
      // Going home ends a payment activity, and with it any Bluetooth link (contract 5.4).
      if (r.name === 'home') { endMerchantSession(); closeLink(); }
      setStack(stackAfterReset(r).map(route => ({ r: route, id: ids.current++, dir: 0 })));
    },
    back: () => setStack(s => (s.length > 1 ? [...s.slice(0, -1).slice(0, -1), { ...s[s.length - 2], id: ids.current++, dir: -1 }] : s)),
    openMenu: () => setMenu(true),
  }), []);
  const current = useRef<Route['name']>('splash');
  useEffect(() => startSync(), []);
  // The free server sleeps when idle. Waking it now means setup and the first lock don't wait.
  useEffect(() => { if (!config.sampleOnly) void api.warmUp(); }, []);
  // The phone's voice engine too, so the first spoken reply doesn't wait for it to start.
  useEffect(() => { speechOut.warmUp(); }, []);
  // DEVICE_REVOKED: this identity is gone, so set the phone up again (contract section 6).
  useEffect(() => onRevoked(() => { setMenu(false); nav.reset({ name: 'language' }); }), []);
  // PayPal's return can arrive as a link if Android closed the in-app browser's caller.
  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      const paid = url ? readDepositReturn(url) : null;
      if (paid?.outcome === 'approved') {
        void completeDeposit(paid.depositId).then(() => { if (!OPEN_ROUTES.includes(current.current)) nav.reset({ name: 'ledger' }); }).catch(() => undefined);
        return;
      }
      const back = url ? readReturn(url) : null;
      if (back?.outcome !== 'approved') return;
      void completeVault(back.vaultId).then(() => { if (!OPEN_ROUTES.includes(current.current)) nav.reset({ name: 'vaultActive' }); }).catch(() => undefined);
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', e => handle(e.url));
    return () => sub.remove();
  }, []);
  // Volume Up twice opens the assistant and starts listening, once the app is unlocked. Where the
  // phone can't do this, or on the screens that already listen, it does nothing.
  useEffect(() => onDoubleVolumeUp(() => {
    const here = current.current;
    if (OPEN_ROUTES.includes(here) || here === 'speak' || here === 'proposal') return;
    setMenu(false);
    nav.go({ name: 'speak', auto: true });
  }), []);
  useEffect(() => {
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'background') { leftAt = Date.now(); return; }
      if (state !== 'active' || leftAt === null) return;
      const away = Date.now() - leftAt;
      leftAt = null;
      if (away < RELOCK_AFTER_MS || OPEN_ROUTES.includes(current.current)) return;
      if (await appLock.hasPin().catch(() => false)) { setMenu(false); nav.reset({ name: 'lock' }); }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menu) { setMenu(false); return true; }
      if (stack.length > 1) { nav.back(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, menu]);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: color.page }} />;
  const top = stack[stack.length - 1];
  current.current = top.r.name;
  return (
    <SafeAreaProvider>
    <AppStateProvider words={words()}>
      <NavCtx.Provider value={nav}>
        <View style={st.stage}>
          <View key={catalogueLanguage()} style={st.phone}>
            <StatusBar style="light" />
            <Page key={top.id} route={top.r} dir={top.dir} />
            <SideMenu open={menu} current={top.r.name} onClose={() => setMenu(false)} />
            {!OPEN_ROUTES.includes(top.r.name) && <ArrivalBanner />}
            <KeepBluetoothOn unlocked={!OPEN_ROUTES.includes(top.r.name)} />
            {web && <DeviceChrome />}
          </View>
        </View>
      </NavCtx.Provider>
    </AppStateProvider>
    </SafeAreaProvider>
  );
}

const web = Platform.OS === 'web';

let cachedWords: { language: string; words: HistoryWords } | null = null;
/** History labels in the current language, stable between renders so state isn't rebuilt. */
function words(): HistoryWords {
  const language = catalogueLanguage();
  if (cachedWords?.language !== language) {
    cachedWords = { language, words: {
      paymentLink: t.paymentLinkReceived, deposit: t.depositDone, merchant: t.someMerchant, customer: t.someCustomer, locked: t.moneyLocked, released: t.moneyReleased,
      withdrawal: t.withdrawalRequested, withdrawn: t.withdrawn, withdrawalFailed: t.withdrawalFailed,
    } };
  }
  return cachedWords.words;
}
// The web preview's phone outline. It is not part of the app's design system.
const PREVIEW_CORNER = 44;

/** Preview only: the phone's own clock and home bar, so the web build reads like the device. */
function DeviceChrome() {
  return (
    <>
      <View pointerEvents="none" style={st.status}>
        <T v="label" c={color.white} style={{ fontFamily: font.semibold, width: 60 }}>11:41</T>
        <View style={st.island} />
        <View style={st.right}>
          <Signal size={icon.sm} color={color.white} strokeWidth={2.4} />
          <Wifi size={icon.sm} color={color.white} strokeWidth={2.4} />
          <BatteryFull size={icon.md} color={color.white} strokeWidth={1.8} />
        </View>
      </View>
      <View pointerEvents="none" style={st.bar} />
    </>
  );
}

const st = StyleSheet.create({
  stage: { flex: 1, backgroundColor: web ? color.stage : color.page, alignItems: 'center', justifyContent: 'center' },
  phone: { flex: 1, width: '100%', maxWidth: layout.maxWidth, backgroundColor: color.page, overflow: 'hidden', ...(web ? { maxHeight: 844, borderRadius: PREVIEW_CORNER, ...shadow.card } : null) },
  status: { position: 'absolute', top: 12, left: 26, right: 22, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  island: { width: 104, height: 29, borderRadius: radius.pill, backgroundColor: color.black },
  right: { width: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.hair },
  bar: { position: 'absolute', bottom: 8, alignSelf: 'center', width: 132, height: 5, borderRadius: radius.pill, backgroundColor: color.white },
});
