import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { color, icon, radius, space, touch, type } from '../../theme/tokens';
import { Button, Panel, Press, T } from '../../components/ui';
import { CurvedHeader, Screen, Section } from '../../components/shell';
import { t } from '../../i18n';
import { LOW_STOCK, MAX_QUANTITY, stockStore, useStock, type StockItem } from './businessStore';

/** What a business has on its shelves. Tap minus when something sells, plus when more arrives. */
export function Stock() {
  const items = useStock();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const amount = Number(quantity);
  const valid = name.trim().length > 0 && Number.isInteger(amount) && amount > 0 && amount <= MAX_QUANTITY;
  const add = () => { void stockStore.add(name, amount).then(() => { setName(''); setQuantity(''); }); };

  return (
    <Screen tabsFor="stock" head={<CurvedHeader home title={t.stock} />}>
      <Panel>
        <T v="label">{t.addItem}</T>
        <TextInput accessibilityLabel={t.itemName} placeholder={t.itemName} placeholderTextColor={color.muted} value={name} onChangeText={setName} maxLength={60} style={s.input} />
        <TextInput accessibilityLabel={t.howMany} placeholder={t.howMany} placeholderTextColor={color.muted} value={quantity} onChangeText={x => setQuantity(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={6} style={s.input} />
        <Button label={t.addToStock} disabled={!valid} onPress={add} />
      </Panel>
      <Section title={t.onTheShelf} />
      {items.length === 0
        ? <T v="body" c={color.muted}>{t.stockEmpty}</T>
        : items.map(item => <Row key={item.id} item={item} />)}
    </Screen>
  );
}

function Row({ item }: { item: StockItem }) {
  const low = item.quantity <= LOW_STOCK;
  return (
    <View style={s.row} accessible accessibilityLabel={`${item.name}, ${item.quantity}`}>
      <View style={{ flex: 1 }}>
        <T v="heading" numberOfLines={2}>{item.name}</T>
        {low && <T v="small" c={color.amber}>{item.quantity === 0 ? t.soldOut : t.runningLow}</T>}
      </View>
      <Press accessibilityRole="button" accessibilityLabel={`${t.soldOne}: ${item.name}`} disabled={item.quantity === 0} onPress={() => { void stockStore.change(item.id, -1); }} style={[s.step, item.quantity === 0 && { opacity: 0.35 }]}>
        <Minus size={icon.md} color={color.text} strokeWidth={2} />
      </Press>
      <T v="heading" style={s.count}>{item.quantity}</T>
      <Press accessibilityRole="button" accessibilityLabel={`${t.addOne}: ${item.name}`} onPress={() => { void stockStore.change(item.id, 1); }} style={s.step}>
        <Plus size={icon.md} color={color.text} strokeWidth={2} />
      </Press>
      <Press accessibilityRole="button" accessibilityLabel={`${t.removeItem}: ${item.name}`} onPress={() => { void stockStore.remove(item.id); }} style={s.step}>
        <Trash2 size={icon.md} color={color.muted} strokeWidth={1.8} />
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  input: { ...type.heading, color: color.text, height: touch.field, paddingHorizontal: space.lg, backgroundColor: color.panelHigh, borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: color.panel, borderRadius: radius.lg, minHeight: touch.row },
  step: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.panelHigh, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
