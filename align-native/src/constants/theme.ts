import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2B2320',
    textSecondary: '#75685F',
    textTertiary: '#83736A',
    background: '#FBF6EE',
    backgroundElement: '#FFFDF9',
    /** Inset surfaces inside cards: pills, tracks, input wells. */
    backgroundMuted: '#F3EADD',
    backgroundSelected: '#F8E3D6',
    border: '#EADFCF',
    /** Accent for text and icons (a shade darker than the fill so small text stays readable on cream). */
    accent: '#B34A23',
    accentSoft: '#F8E3D6',
    /** Solid fill for primary buttons and selected pills; always pair with onAccent for content on top. */
    accentFill: '#C4532A',
    onAccent: '#FFFFFF',
    /** Translucent layer for tiles and tracks drawn on top of an accentFill surface. */
    onAccentOverlay: 'rgba(255,255,255,0.18)',
    income: '#2F7A4D',
    incomeSoft: '#E4F0E6',
    expense: '#C2413B',
    expenseSoft: '#F8E1DE',
    warning: '#8A6414',
    warningSoft: '#FBEFD6',
    /** Legacy name (was a separate teal accent); kept as an alias so every screen shares one accent. */
    blue: '#B34A23',
    red: '#C2413B',
  },
  dark: {
    text: '#F6EEE6',
    textSecondary: '#C3B4A6',
    textTertiary: '#8E7F72',
    background: '#1C1714',
    backgroundElement: '#262019',
    backgroundMuted: '#312922',
    backgroundSelected: '#3D2A20',
    border: '#3A3029',
    accent: '#F29062',
    accentSoft: '#3D2A20',
    accentFill: '#E8784A',
    onAccent: '#1C1310',
    onAccentOverlay: 'rgba(28,19,16,0.12)',
    income: '#7BC49A',
    incomeSoft: '#1F2C22',
    expense: '#F2837A',
    expenseSoft: '#3A221F',
    warning: '#E9B45A',
    warningSoft: '#3A2E1A',
    blue: '#F29062',
    red: '#F2837A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Cards sit on a soft border plus a faint warm shadow; floating surfaces lift a little more. */
export const Shadow = {
  card: {
    shadowColor: '#5A3A22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  raised: {
    shadowColor: '#3A2412',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Headings use the rounded system face (SF Pro Rounded on Apple devices) for a softer, friendlier voice. */
export const Type = {
  displayLg: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.6, fontFamily: Fonts?.rounded },
  display: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.4, fontFamily: Fonts?.rounded },
  title: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2, fontFamily: Fonts?.rounded },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const TabBarHeight = 60;
/** Space under the tab items: the home indicator needs ~20pt, not the full 34pt safe-area inset. */
export const tabBarBottomPadding = (bottomInset: number) => Math.max(bottomInset - 14, 0);
