import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { REFUSAL } from '@tpay/shared/contracts/refusals';
import { motion, space } from '../../theme/tokens';
import { Button, HearIt, Panel, T, money, native, useReduceMotion } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { StatusMark } from '../../components/money';
import { Duo } from '../../components/rows';
import { color } from '../../theme/tokens';
import { useNav, type Side } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import type { PaymentRefusal } from './payments';
import { endMerchantSession } from './merchant';
import { closeLink } from './link';

/**
 * Every refusal (contract 5.3) says what happened and what to do next, and never that
 * money moved. A duplicate is not an error for the customer, so it offers the receipt
 * that was already given.
 */
export function Refusal({ code, side, amount, existingId }: { code: PaymentRefusal; side: Side; amount?: number; existingId?: string }) {
  const nav = useNav();
  const { offline } = useApp();
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  const copy = t.refusal[code];
  const duplicate = code === REFUSAL.DUPLICATE_VOUCHER;

  useEffect(() => {
    if (!duplicate && code !== REFUSAL.INVALID_FRAME) { closeLink(); if (side === 'merchant') endMerchantSession(); }
    if (reduce) return;
    Animated.sequence([-7, 6, -4, 0].map(toValue => Animated.timing(x, { toValue, duration: motion.shake, useNativeDriver: native }))).start();
  }, []);

  const footer = duplicate && existingId
    ? <Button label={t.showReceiptAgain} onPress={() => nav.reset({ name: 'credit', voucherId: existingId, bluetooth: false, again: true })} />
    : code === 'NO_VAULT'
      ? <Button label={t.addMoney} onPress={() => nav.reset({ name: 'amount', mode: 'lock' })} />
      : code === REFUSAL.INVALID_FRAME
        ? <Button label={t.scanAgain} onPress={() => nav.back()} />
        : <Button label={t.backHome} onPress={() => nav.reset({ name: 'home' })} />;

  return (
    <Screen head={<CurvedHeader back bell={false} title={side === 'merchant' ? t.scanVoucher : t.checkPay} />} footer={footer}>
      <Animated.View style={{ transform: [{ translateX: x }], gap: space.md }}>
        <Panel style={s.stop}>
          <StatusMark status={duplicate ? 'blocked' : 'refused'} size={44} />
          <T v="hello">{copy.title}</T>
          <T v="body" c={color.muted}>{copy.body}</T>
        </Panel>
        {code === REFUSAL.INSUFFICIENT_VAULT_CAPACITY && amount !== undefined && (
          <Duo items={[{ label: t.sellerAskedShort, value: money(amount) }, { label: t.haveShort, value: money(offline.leftNgn) }]} />
        )}
        {code !== REFUSAL.INSUFFICIENT_VAULT_CAPACITY && amount !== undefined && !duplicate && (
          <Panel><T v="label">{money(amount)}</T></Panel>
        )}
      </Animated.View>
      <HearIt auto say={`${copy.title}. ${copy.body}`} />
      <View />
    </Screen>
  );
}

const s = StyleSheet.create({
  stop: { gap: space.xs, paddingVertical: space.xl },
});
