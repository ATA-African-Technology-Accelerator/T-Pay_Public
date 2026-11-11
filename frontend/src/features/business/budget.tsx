import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { color, radius, space, touch, type } from '../../theme/tokens';
import { Button, Panel, T, money } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { useApp } from '../../state/appState';
import { spentThisMonth } from './spent';
import { t } from '../../i18n';
import { budgetStore, useBudget } from './businessStore';

const MAX_BUDGET_NAIRA = 1_000_000_000;

/** A monthly spending limit, and how much of it is used. It only shows; it never blocks a payment. */
export function Budget() {
  const { history } = useApp();
  const limit = useBudget();
  const [text, setText] = useState('');
  const naira = Number(text);
  const valid = Number.isInteger(naira) && naira > 0 && naira <= MAX_BUDGET_NAIRA;
  const spent = spentThisMonth(history);
  const used = limit ? Math.min(spent / limit, 1) : 0;
  const over = limit !== null && spent > limit;

  return (
    <Screen tabsFor="budget" head={<CurvedHeader home title={t.budget} />}>
      {limit !== null && (
        <Panel>
          <T v="label" c={color.muted}>{t.spentThisMonth}</T>
          <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(spent)}</T>
          <View style={s.track} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(used * 100) }}>
            <View style={[s.fill, { width: `${Math.round(used * 100)}%`, backgroundColor: over ? color.coral : color.blue }]} />
          </View>
          <T v="body" c={over ? color.coral : color.text}>{over ? t.budgetOver(money(spent - limit)) : t.budgetLeft(money(limit - spent), money(limit))}</T>
        </Panel>
      )}
      <Panel>
        <T v="label">{limit === null ? t.setBudget : t.changeBudget}</T>
        <TextInput accessibilityLabel={t.monthlyLimit} placeholder={t.monthlyLimit} placeholderTextColor={color.muted} value={text} onChangeText={x => setText(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={10} style={s.input} />
        <T v="small" c={color.muted}>{t.budgetHint}</T>
        <Button label={t.saveBudget} disabled={!valid} onPress={() => { void budgetStore.save(naira * 100).then(() => setText('')); }} />
        {limit !== null && <Button kind="quiet" label={t.clearBudget} onPress={() => { void budgetStore.save(null); }} />}
      </Panel>
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { ...type.heading, color: color.text, height: touch.field, paddingHorizontal: space.lg, backgroundColor: color.panelHigh, borderRadius: radius.md },
  track: { height: 12, borderRadius: radius.pill, backgroundColor: color.panelHigh, overflow: 'hidden' },
  fill: { height: 12, borderRadius: radius.pill },
});
