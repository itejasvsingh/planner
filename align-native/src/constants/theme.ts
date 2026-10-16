import '@/global.css';
import { Platform } from 'react-native';

/**
 * Navy ink on a cool grey page with white cards and a deep blue accent (after Fold's look). Every colour is a role,
 * so screens never hard-code one; secondary and tertiary text keep 4.5:1 on both the page and white cards.
 */
export const Colors = {
  light: {
    text: '#20294C',
    textSecondary: '#4F5475',
    /** Keeps 4.5:1 on white and the page background. */
    textTertiary: '#676B89',
    background: '#F0F1F5',
    backgroundElement: '#FFFFFF',
    /** Inset surfaces inside cards: pills, tracks, input wells. */
    backgroundMuted: '#F0F1F5',
    backgroundSelected: '#E3E7F3',
    border: '#DDDFE9',
    /** Deep blue for text, icons and selection. */
    accent: '#0A2D67',
    accentSoft: '#E3E7F3',
    /** Solid fill for primary buttons and selected pills (navy); always pair with onAccent for content on top. */
    accentFill: '#20294C',
    onAccent: '#FFFFFF',
    /** Translucent layer for tiles and tracks drawn on top of an accentFill surface. */
    onAccentOverlay: 'rgba(255,255,255,0.16)',
    /** The Money balance card: a navy panel with white text and a mint progress bar. */
    heroFill: '#20294C',
    onHero: '#FFFFFF',
    onHeroOverlay: 'rgba(255,255,255,0.14)',
    heroBar: '#8FD9B6',
    /** Text-safe green/red (the bright fills below are for tiles with white text). */
    income: '#007A50',
    incomeSoft: '#EAF8F1',
    incomeFill: '#00875A',
    expense: '#C9222F',
    expenseSoft: '#FDEEEF',
    expenseFill: '#D92D3A',
    warning: '#9A6300',
    warningSoft: '#FEF6E6',
    /** Legacy name (was a separate teal accent); kept as an alias so every screen shares one accent. */
    blue: '#0A2D67',
    red: '#D92D3A',
  },
  dark: {
    text: '#F0F1F5',
    textSecondary: '#B7BCD6',
    textTertiary: '#8F95B5',
    background: '#0E1325',
    backgroundElement: '#171E36',
    backgroundMuted: '#212A47',
    backgroundSelected: '#243257',
    border: '#2B3558',
    accent: '#8FB4FF',
    accentSoft: '#1E2C52',
    accentFill: '#3F63D6',
    onAccent: '#FFFFFF',
    onAccentOverlay: 'rgba(255,255,255,0.16)',
    heroFill: '#1B2547',
    onHero: '#FFFFFF',
    onHeroOverlay: 'rgba(143,180,255,0.16)',
    heroBar: '#8FD9B6',
    income: '#34D399',
    incomeSoft: '#0E2A20',
    incomeFill: '#00875A',
    expense: '#FF7A84',
    expenseSoft: '#3A1519',
    expenseFill: '#D92D3A',
    warning: '#FCAC12',
    warningSoft: '#33260A',
    blue: '#8FB4FF',
    red: '#FF7A84',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Cards get a barely-there shadow; floating surfaces lift a little more. */
export const Shadow = {
  card: {
    shadowColor: '#20294C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 1,
  },
  raised: {
    shadowColor: '#20294C',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.12,
    shadowRadius: 25,
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
