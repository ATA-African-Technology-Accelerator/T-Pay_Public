import { Easing, Platform } from 'react-native';

// Every visual value in the app lives here. Screens never hard-code a colour.
// Palette "t-payy" chosen by the owner on 11 Nov 2026: navy #000D20 and #000F25, dark brown #160D0E,
// maroon #290000 and #200000. The hero glow runs navy to maroon under a soft white light. The body is
// dark reddish (brown with maroon glows), and cards are frosted glass over it: a see-through white fill
// with a fine light edge. Card icons are blue. Green, amber and coral are kept: paid, waiting and wrong.
export const color = {
  white: '#FFFFFF',
  page: '#160D0E',
  // Glass: see-through, so the reddish glow behind shows through every card.
  panel: 'rgba(255,255,255,0.06)',
  panelHigh: 'rgba(255,255,255,0.11)',
  line: 'rgba(255,255,255,0.12)',
  // Solid surfaces that sit over other content (the side menu, the tab bar), where glass would show clutter.
  sheet: '#1E0B0C',
  // Icons inside cards.
  icon: '#7AA2FF',
  text: '#F3F5F9',
  muted: '#9DA8BA',
  onDark: '#C9D0DD',
  // Text and icons on light fills only, never on the page.
  ink: '#160D0E',
  // The accent: selected tabs, links and the active menu row. A light neutral reads on every navy and maroon.
  blue: '#E4E8F0',
  green: '#6FD98C',
  amber: '#F0B64A',
  coral: '#F58B7C',
  stage: '#000A1A',
  // The logo's own navy. Only the loading screens use it, so the logo sits on its own background.
  brand: '#061A42',
  // The dark navy the app opens on, before it fills with the logo's blue. Android's own splash uses it too.
  night: '#000D20',
  black: '#000000',
} as const;

// Hero glow stops, deepest first. Only Aurora uses these. The edge is the soft white light at the top.
export const glow = { base: '#000F25', mid: '#160D0E', bright: '#290000', edge: '#F2EEEE' } as const;
// The body's glow behind the glass cards: maroon light on the dark brown page, with a hint of navy.
// The two reds are a few steps brighter than the palette's maroons so the pulse can be seen on a phone.
export const bodyGlow = { a: '#5A0C0C', b: '#420404', c: '#001A3D' } as const;

// Glass controls that sit on the hero glow.
export const glass = { fill: 'rgba(255,255,255,0.10)', line: 'rgba(255,255,255,0.22)', lineStrong: 'rgba(255,255,255,0.34)', well: 'rgba(0,13,32,0.35)', tint: 'rgba(228,232,240,0.16)' } as const;

// 4px grid. The only spacing values in the app.
export const space = { hair: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 36 } as const;
// Three corners, plus pill for anything fully round.
export const radius = { sm: 12, md: 16, lg: 24, pill: 999 } as const;
export const touch = { min: 48, button: 56, field: 60, row: 64 } as const;
export const icon = { sm: 18, md: 22, lg: 26, xl: 46 } as const;

// Inter throughout: it covers every Yoruba, Igbo and Hausa letter and the naira sign.
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  head: 'Inter_600SemiBold',
  headStrong: 'Inter_600SemiBold',
} as const;

export const type = {
  moneyL: { fontFamily: font.headStrong, fontSize: 40, lineHeight: 48, letterSpacing: -1 },
  money: { fontFamily: font.headStrong, fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  hello: { fontFamily: font.headStrong, fontSize: 24, lineHeight: 32, letterSpacing: -0.3 },
  title: { fontFamily: font.head, fontSize: 18, lineHeight: 26 },
  section: { fontFamily: font.head, fontSize: 17, lineHeight: 24 },
  heading: { fontFamily: font.medium, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  micro: { fontFamily: font.medium, fontSize: 11, lineHeight: 14 },
  key: { fontFamily: font.medium, fontSize: 24, lineHeight: 30 },
} as const;

// The app is designed as a phone-width column. On a tablet it stays that width, centred, instead
// of stretching: a keypad or a button three times as wide is harder to use, not easier.
// The web preview shows a phone mock-up.
export const layout = { maxWidth: Platform.OS === 'web' ? 390 : 560 } as const;

export const shadow = {
  card: { shadowColor: color.ink, shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  bar: { shadowColor: color.ink, shadowOpacity: 0.24, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
} as const;

// Motion explains a change and then gets out of the way. Every duration and curve comes from here.
export const motion = {
  quick: 150, base: 220, slow: 300, bar: 500, count: 700, hold: 1100, release: 350, stagger: 60,
  sweep: 1500, pulse: 1300, spin: 9000, shake: 60,
  // One breath of the hero glow: lively, but slow enough that it never pulls the eye from the money.
  drift: 9000,
  spring: { damping: 20, stiffness: 240, mass: 1 },
  ease: { out: Easing.bezier(0.22, 1, 0.36, 1), inOut: Easing.bezier(0.65, 0, 0.35, 1), linear: Easing.linear },
} as const;
