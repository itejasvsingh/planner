import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0D0E0F',
    textSecondary: '#5E5F66',
    /** Keeps 4.5:1 on white and the page background. */
    textTertiary: '#70717A',
    background: '#F7F7FA',
    backgroundElement: '#FFFFFF',
    /** Inset surfaces inside cards: pills, tracks, input wells. */
    backgroundMuted: '#F1F1FA',
    backgroundSelected: '#EEE5FF',
    border: '#EAEAF2',
    /** Violet accent for text, icons and selection. */
    accent: '#7F3DFF',
    accentSoft: '#EEE5FF',
    /** Solid fill for primary buttons and selected pills; always pair with onAccent for content on top. */
    accentFill: '#7F3DFF',
    onAccent: '#FFFFFF',
    /** Translucent layer for tiles and tracks drawn on top of an accentFill surface. */
    onAccentOverlay: 'rgba(255,255,255,0.18)',
    /** The Money balance card: a soft lavender panel with ink text and a violet progress bar. */
    heroFill: '#F2EAFF',
    onHero: '#0D0E0F',
    onHeroOverlay: 'rgba(127,61,255,0.12)',
    heroBar: '#7F3DFF',
    /** Text-safe green/red (the bright fills below are for tiles with white text). */
    income: '#00875A',
    incomeSoft: '#CFFAEA',
    incomeFill: '#00875A',
    expense: '#D92D3A',
    expenseSoft: '#FDD5D7',
    expenseFill: '#D92D3A',
    warning: '#9A6300',
    warningSoft: '#FCEED4',
    /** Legacy name (was a separate teal accent); kept as an alias so every screen shares one accent. */
    blue: '#7F3DFF',
    red: '#D92D3A',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#B4B4C4',
    textTertiary: '#8E8EA3',
    background: '#0E0D14',
    backgroundElement: '#18171F',
    backgroundMuted: '#22212B',
    backgroundSelected: '#2A1F45',
    border: '#2A2933',
    accent: '#B08CFF',
    accentSoft: '#2A1F45',
    accentFill: '#8F55FF',
    onAccent: '#FFFFFF',
    onAccentOverlay: 'rgba(255,255,255,0.16)',
    heroFill: '#1F1733',
    onHero: '#FFFFFF',
    onHeroOverlay: 'rgba(176,140,255,0.14)',
    heroBar: '#B08CFF',
    income: '#34D399',
    incomeSoft: '#0E2A20',
    incomeFill: '#00875A',
    expense: '#FF7A84',
    expenseSoft: '#3A1519',
    expenseFill: '#D92D3A',
    warning: '#FCAC12',
    warningSoft: '#33260A',
    blue: '#B08CFF',
    red: '#FF7A84',
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

/** Cards get a barely-there shadow; floating surfaces lift a little more. */
export const Shadow = {
  card: {
    shadowColor: '#1E1A3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  raised: {
    shadowColor: '#1E1A3B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
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

/** Plain system face throughout; hierarchy comes from size and weight. */
export const Type = {
  displayLg: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.8 },
  display: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 19, fontWeight: '600' as const, letterSpacing: -0.3 },
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
