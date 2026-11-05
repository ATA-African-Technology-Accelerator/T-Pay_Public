import React, { useEffect, useRef } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { color, motion } from '../theme/tokens';
import { Button, HearIt, Panel, Rise, T, money } from '../components/ui';
import { CurvedHeader, Screen } from '../components/shell';
import { SampleCode, StatusMark, Steps } from '../components/money';
import { useNav } from '../nav';
import { useStore } from '../demo/store';
import { t } from '../i18n/en';
import { p } from './pay';

const useSize = () => { const { width } = useWindowDimensions(); return Math.min(Math.min(width, 390) - 110, 230); };

export function Request({ amount }: { amount: number }) {
  const nav = useNav();
  const size = useSize();
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.showCustomer} />} footer={<Button label={t.scanVoucherGo} onPress={() => nav.go({ name: 'scan', kind: 'voucher', amount })} />}>
      <Steps at={1} />
      <Rise><Panel style={p.center2}><SampleCode size={size} seed={3} /></Panel></Rise>
      <T v="moneyL" style={p.center}>{money(amount)}</T>
      <View style={p.state}><StatusMark status="pending" size={22} /><T v="label">{t.waiting}</T></View>
    </Screen>
  );
}

/** Money is in, but only as Processing. The receipt code goes back to the customer. */
export function Credit({ amount, again }: { amount: number; again?: boolean }) {
  const nav = useNav();
  const { receive } = useStore();
  const size = useSize();
  const once = useRef(false);
  useEffect(() => { if (!again && !once.current) { once.current = true; receive(amount); } }, []);
  return (
    <Screen head={<CurvedHeader bell={false} title={t.gotMoney} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
      <Steps at={3} />
      <Rise>
        <Panel style={p.row}>
          <StatusMark status="pending" size={44} />
          <View style={{ flex: 1 }}>
            <T v="money" numberOfLines={1}>{money(amount)}</T>
            <T v="small" c={color.amber}>{t.status.pending}</T>
          </View>
        </Panel>
      </Rise>
      <Rise delay={motion.stagger * 2}><Panel style={p.center2}><SampleCode size={size} seed={5} /><T v="label">{t.customerScans}</T></Panel></Rise>
      <T v="body" c={color.muted} style={p.center}>{t.pendingPaid}</T>
      <HearIt say={`${t.gotMoney}. ${amount} naira. ${t.pendingPaid}`} />
    </Screen>
  );
}
