import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { color, icon, motion, radius, space } from '../../theme/tokens';
import { HearIt, Press, Rise, T } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { t } from '../../i18n';

/** Plain answers, one tap from home, so nobody has to dig through menus when a payment worries them. */
export function Help() {
  const [open, setOpen] = useState(0);
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.help} />}>
      {t.faqs.map((f, i) => {
        const on = open === i;
        const Chevron = on ? ChevronUp : ChevronDown;
        return (
          <Rise key={f.q} delay={i * motion.stagger}>
            <View style={h.item}>
              <Press accessibilityRole="button" accessibilityState={{ expanded: on }} accessibilityLabel={f.q} onPress={() => setOpen(on ? -1 : i)} style={h.q}>
                <T v="label" style={{ flex: 1 }}>{f.q}</T>
                <Chevron size={icon.md} color={color.muted} strokeWidth={1.8} />
              </Press>
              {on && (
                <View style={h.a}>
                  <T v="body" c={color.muted}>{f.a}</T>
                  <HearIt say={f.a} />
                </View>
              )}
            </View>
          </Rise>
        );
      })}
    </Screen>
  );
}

const h = StyleSheet.create({
  item: { backgroundColor: color.panel, borderRadius: radius.md },
  q: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  a: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
});
