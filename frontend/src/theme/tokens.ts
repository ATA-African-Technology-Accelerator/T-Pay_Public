import { Easing, Platform } from 'react-native';

// Every visual value in the app lives here. Screens never hard-code a colour.
// Dark wallet direction chosen by the owner on 5 Nov 2026. Page, panels and hero blues are sampled from that reference.
export const color = {
  white: '#FFFFFF',
  page: '#050608',
  panel: '#111317',
  panelHigh: '#1A1E24',
  line: '#262B33',
  text: '#F3F5F9',
  muted: '#9AA6B8',
  onDark: '#C9D0DD',
  // Text and icons on light fills only, never on the page.
  ink: '#07090D',
  blue: '#8FB4F0',
  green: '#6FD98C',
  amber: '#F0B64A',
  coral: '#F58B7C',
  stage: '#040608',
  black: '#000000',
} as const;

// Hero glow stops, deepest first. Only Aurora uses these.
export const glow = { base: '#0C2137', mid: '#1D436D', bright: '#3265A4', edge: '#6F84BA' } as const;

// Glass controls that sit on the hero glow.
export const glass = { fill: 'rgba(255,255,255,0.10)', line: 'rgba(255,255,255,0.22)', lineStrong: 'rgba(255,255,255,0.34)', well: 'rgba(5,6,8,0.35)', tint: 'rgba(143,180,240,0.20)' } as const;

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
  spring: { damping: 20, stiffness: 240, mass: 1 },
  ease: { out: Easing.bezier(0.22, 1, 0.36, 1), inOut: Easing.bezier(0.65, 0, 0.35, 1), linear: Easing.linear },
} as const;
