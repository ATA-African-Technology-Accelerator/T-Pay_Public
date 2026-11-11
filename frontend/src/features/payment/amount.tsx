import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MAX_REQUEST_NGN_MINOR } from '@tpay/shared/application/use-cases/createPaymentRequest';
import { color, radius, space } from '../../theme/tokens';
import { Keypad } from '../../components/keypad';
import { Button, Panel, T, naira } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { useNav } from '../../nav';
import { t } from '../../i18n';

const HOURS = [6, 12, 24];

/**
 * Amount entry, in whole naira. Locking is limited only by what the backend allows,
 * because PayPal holds the money: the Main wallet plays no part.
 */
export function Amount({ mode }: { mode: 'lock' | 'collect' }) {
  const nav = useNav();
  const lock = mode === 'lock';
  const [nairaAmount, setNaira] = useState(0);
  const [hours, setHours] = useState(24);
  const capNaira = MAX_REQUEST_NGN_MINOR / 100;
  const kobo = nairaAmount * 100;
  const next = () => nav.go(lock ? { name: 'vaultReview', amount: kobo, hours } : { name: 'request', amount: kobo });
  const press = (k: string) => setNaira(a => (k === 'del' ? Math.floor(a / 10) : Math.min(Number(`${a}${k}`), capNaira)));
  return (
    <Screen head={<CurvedHeader back bell={false} title={lock ? t.howMuchLock : t.howMuchCollect} />}>
      <Panel style={p.amount}>
        <T v="small" c={color.muted} numberOfLines={1}>{lock ? t.amountLock : t.amountCollect}</T>
        <T v="moneyL" c={kobo ? color.text : color.muted} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">{naira(kobo)}</T>
        {lock && <T v="small" c={color.muted}>{t.lockFromPayPal}</T>}
      </Panel>
      {lock && (
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel={t.howLong}>
          <T v="smallStrong" c={color.muted}>{t.howLong}</T>
          <View style={p.chips}>
            {HOURS.map(h => (
              <Pressable key={h} accessibilityRole="radio" accessibilityState={{ selected: h === hours }} accessibilityLabel={`${h} ${t.hours}`} onPress={() => setHours(h)} style={[p.chip, h === hours && p.chipOn]}>
                <T v="label" c={h === hours ? color.text : color.muted}>{`${h} ${t.hours}`}</T>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Button label={!kobo ? t.enterAmount : t.continue} disabled={!kobo} onPress={next} />
      <Keypad onKey={press} />
    </Screen>
  );
}

const p = StyleSheet.create({
  amount: { gap: space.hair, paddingVertical: space.lg },
  chips: { flexDirection: 'row', gap: space.sm },
  chip: { flex: 1, minHeight: 48, borderRadius: radius.md, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  chipOn: { backgroundColor: color.panelHigh, borderColor: color.blue },
});
