// Naira versions of the mock-up's icon set. lucide has no naira coins or bags, so these are drawn here.
import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { color } from '../theme/tokens';

type P = { size?: number; c?: string; w?: number };

const Naira = ({ x, y, s = 1, c, w }: { x: number; y: number; s?: number; c: string; w: number }) => (
  <G transform={`translate(${x} ${y}) scale(${s})`}>
    <Path d="M-2.6 4V-4L2.6 4V-4M-4 -1H4M-4 1.2H4" fill="none" stroke={c} strokeWidth={w / s} strokeLinecap="round" strokeLinejoin="round" />
  </G>
);

export const HomeIcon = ({ size = 26, c = color.text, w = 1.6 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3.6 10.4 12 3.6l8.4 6.8V17a4 4 0 0 1-4 4H7.6a4 4 0 0 1-4-4z" stroke={c} strokeWidth={w} strokeLinejoin="round" />
    <Path d="M9.2 16.2c1.7 1.1 3.9 1.1 5.6 0" stroke={c} strokeWidth={w} strokeLinecap="round" />
  </Svg>
);

export const BagIcon = ({ size = 26, c = color.text, w = 1.6 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8.2 3.4c1.2.8 2.5.8 3.8 0 1.3.8 2.6.8 3.8 0l-1.5 4H9.7z" stroke={c} strokeWidth={w} strokeLinejoin="round" />
    <Path d="M9.7 7.4C6.4 9.2 3.6 12.4 3.6 16c0 3.3 2.9 5 8.4 5s8.4-1.7 8.4-5c0-3.6-2.8-6.8-6.1-8.6" stroke={c} strokeWidth={w} strokeLinecap="round" />
    <Naira x={12} y={14.4} s={0.82} c={c} w={w * 0.9} />
  </Svg>
);

export const CoinPlusIcon = ({ size = 26, c = color.text, w = 1.6 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M16.6 5.3A8.4 8.4 0 1 0 19.6 11" stroke={c} strokeWidth={w} strokeLinecap="round" />
    <Naira x={11.2} y={12.6} s={0.82} c={c} w={w * 0.9} />
    <Path d="M20 2.6v6M17 5.6h6" stroke={c} strokeWidth={w} strokeLinecap="round" />
  </Svg>
);

export const HandCoinIcon = ({ size = 26, c = color.text, w = 1.6 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={14.6} cy={7.4} r={5.2} stroke={c} strokeWidth={w} />
    <Naira x={14.6} y={7.4} s={0.58} c={c} w={w * 0.85} />
    <Path d="M2.4 15.6h3.2c1.2 0 2-.7 3.2-.7h3.3a1.6 1.6 0 0 1 0 3.2H9.2" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="m12.6 17.4 5.2-2.4a1.7 1.7 0 0 1 1.8 2.9L13.4 21.4H7.2l-4.8-1.6" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CheckDisc = ({ size = 26, c = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={11} fill={c} />
    <Path d="m7 12.4 3.4 3.4L17 8.8" fill="none" stroke={color.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ClockDisc = ({ size = 26, c = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12.6} r={10.4} fill={c} />
    <Path d="M12 7.2v5.6l3.6 2" fill="none" stroke={color.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M4 3.4 2 5.4M20 3.4l2 2" stroke={c} strokeWidth={2.2} strokeLinecap="round" />
  </Svg>
);

export const CalendarDisc = ({ size = 26, c = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={2} y={4} width={20} height={18} rx={5.4} fill={c} />
    <Path d="M7.4 2v4M16.6 2v4" stroke={c} strokeWidth={2.4} strokeLinecap="round" />
    <Path d="M2 10.4h20" stroke={color.white} strokeWidth={1.8} />
    <Path d="M7.4 15h4.4M14.6 15h2" stroke={color.white} strokeWidth={2.2} strokeLinecap="round" />
  </Svg>
);

export const WalletDisc = ({ size = 26, c = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M2 8a4.6 4.6 0 0 1 4.6-4.6H16A2.6 2.6 0 0 1 18.6 6H6.6v.1H17.4A4.6 4.6 0 0 1 22 10.7v6.7A4.6 4.6 0 0 1 17.4 22H6.6A4.6 4.6 0 0 1 2 17.4z" fill={c} />
    <Rect x={14} y={11.2} width={8} height={5.6} rx={2.8} fill={color.white} />
    <Circle cx={16.8} cy={14} r={1.2} fill={c} />
  </Svg>
);

export const NairaDisc = ({ size = 26, c = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={11} fill={c} />
    <Naira x={12} y={12} s={1.2} c={color.white} w={1.8} />
  </Svg>
);

export const CrossDisc = ({ size = 26, c = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={11} fill={c} />
    <Path d="m8.4 8.4 7.2 7.2M15.6 8.4l-7.2 7.2" stroke={color.white} strokeWidth={2.2} strokeLinecap="round" />
  </Svg>
);

export const AlertDisc = ({ size = 26, c = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M9.8 3.3a2.5 2.5 0 0 1 4.4 0l7.5 13.8a2.5 2.5 0 0 1-2.2 3.7H4.5a2.5 2.5 0 0 1-2.2-3.7z" fill={c} />
    <Path d="M12 8.6v5" stroke={color.white} strokeWidth={2.3} strokeLinecap="round" />
    <Circle cx={12} cy={17} r={1.3} fill={color.white} />
  </Svg>
);

export const PlusDisc = ({ size = 26, c = color.text }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={11} fill={c} />
    <Path d="M12 7.4v9.2M7.4 12h9.2" stroke={color.white} strokeWidth={2.2} strokeLinecap="round" />
  </Svg>
);
