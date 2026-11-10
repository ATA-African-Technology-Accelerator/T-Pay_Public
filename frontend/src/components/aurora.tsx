import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { glow } from '../theme/tokens';

/** The soft blue light behind the balance. Decorative, and kept away from small text so contrast holds. */
export function Aurora() {
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" importantForAccessibility="no" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`a${id}`} cx="88%" cy="-8%" rx="72%" ry="62%">
            <Stop offset="0" stopColor={glow.edge} stopOpacity={0.95} />
            <Stop offset="1" stopColor={glow.edge} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`b${id}`} cx="22%" cy="104%" rx="80%" ry="66%">
            <Stop offset="0" stopColor={glow.bright} stopOpacity={1} />
            <Stop offset="1" stopColor={glow.bright} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`c${id}`} cx="62%" cy="48%" rx="70%" ry="60%">
            <Stop offset="0" stopColor={glow.mid} stopOpacity={1} />
            <Stop offset="1" stopColor={glow.mid} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={glow.base} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#c${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#b${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#a${id})`} />
      </Svg>
    </View>
  );
}
