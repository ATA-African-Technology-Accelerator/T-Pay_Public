import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Signal, Wifi, BatteryFull } from 'lucide-react-native';
import { color, font, icon, motion, radius, space, shadow } from './theme/tokens';
import { T, native, useReduceMotion } from './components/ui';
import { Nav, NavCtx, Route } from './nav';
import { StoreProvider } from './demo/store';
import { Details, Language, Splash } from './features/onboarding';
import { HomeScreen } from './features/home';
import { Amount, Delivered, Duplicate, Refused, Review, Scan, Tampered, Voucher } from './features/pay';
import { Credit, Request } from './features/collect';
import { Activity, Assist, Ledger, Proposal, SettingsScreen, Speak } from './features/lists';
import { Melt, VaultActive, VaultReview, VaultScreen } from './features/vault';
import { Lock } from './features/lock';
import { Receive, SendDone, SendReview, SendTo } from './features/send';
import { Help } from './features/help';
import { Receipt } from './features/receipt';
import { SideMenu } from './components/menu';

function render(r: Route) {
  switch (r.name) {
    case 'splash': return <Splash />;
    case 'language': return <Language />;
    case 'details': return <Details />;
    case 'lock': return <Lock />;
    case 'help': return <Help />;
    case 'receipt': return <Receipt id={r.id} />;
    case 'home': return <HomeScreen />;
    case 'activity': return <Activity />;
    case 'ledger': return <Ledger />;
    case 'vault': return <VaultScreen />;
    case 'vaultReview': return <VaultReview amount={r.amount} hours={r.hours} />;
    case 'vaultActive': return <VaultActive amount={r.amount} hours={r.hours} />;
    case 'melt': return <Melt />;
    case 'speak': return <Speak />;
    case 'proposal': return <Proposal amount={r.amount} offline={r.offline} />;
    case 'assist': return <Assist />;
    case 'settings': return <SettingsScreen />;
    case 'amount': return <Amount mode={r.mode} to={r.to} />;
    case 'sendTo': return <SendTo />;
    case 'sendReview': return <SendReview amount={r.amount} to={r.to} />;
    case 'sendDone': return <SendDone amount={r.amount} to={r.to} id={r.id} />;
    case 'receive': return <Receive />;
    case 'scan': return <Scan kind={r.kind ?? 'request'} amount={r.amount ?? 0} />;
    case 'review': return <Review amount={r.amount} />;
    case 'refused': return <Refused amount={r.amount} />;
    case 'tampered': return <Tampered amount={r.amount} />;
    case 'duplicate': return <Duplicate amount={r.amount} />;
    case 'voucher': return <Voucher amount={r.amount} />;
    case 'delivered': return <Delivered amount={r.amount} />;
    case 'request': return <Request amount={r.amount} />;
    case 'credit': return <Credit amount={r.amount} again={r.again} />;
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
    reset: r => setStack([{ r, id: ids.current++, dir: 0 }]),
    back: () => setStack(s => (s.length > 1 ? [...s.slice(0, -1).slice(0, -1), { ...s[s.length - 2], id: ids.current++, dir: -1 }] : s)),
    openMenu: () => setMenu(true),
  }), []);
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
  return (
    <StoreProvider>
      <NavCtx.Provider value={nav}>
        <View style={st.stage}>
          <View style={st.phone}>
            <StatusBar style="light" />
            <Page key={top.id} route={top.r} dir={top.dir} />
            <SideMenu open={menu} current={top.r.name} onClose={() => setMenu(false)} />
            {web && <DeviceChrome />}
          </View>
        </View>
      </NavCtx.Provider>
    </StoreProvider>
  );
}

const web = Platform.OS === 'web';
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
  phone: { flex: 1, width: '100%', backgroundColor: color.page, overflow: 'hidden', ...(web ? { maxWidth: 390, maxHeight: 844, borderRadius: PREVIEW_CORNER, ...shadow.card } : null) },
  status: { position: 'absolute', top: 12, left: 26, right: 22, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  island: { width: 104, height: 29, borderRadius: radius.pill, backgroundColor: color.black },
  right: { width: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.hair },
  bar: { position: 'absolute', bottom: 8, alignSelf: 'center', width: 132, height: 5, borderRadius: radius.pill, backgroundColor: color.white },
});
