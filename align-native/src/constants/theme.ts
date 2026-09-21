import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#14181F',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    background: '#F7F7F8',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEF2FF',
    border: '#E5E7EB',
    accent: '#6366F1',
    accentSoft: '#EEF2FF',
    income: '#10B981',
    incomeSoft: '#ECFDF5',
    expense: '#F43F5E',
    expenseSoft: '#FEF2F2',
    warning: '#F59E0B',
    warningSoft: '#FFFBEB',
    blue: '#137C66',
    red: '#F43F5E',
  },
  dark: {
    text: '#F5F5F7',
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
    background: '#0A0B0F',
    backgroundElement: '#16181D',
    backgroundSelected: '#1E1B3A',
    border: '#26282E',
    accent: '#818CF8',
    accentSoft: '#1E1B3A',
    income: '#34D399',
    incomeSoft: '#0F2A20',
    expense: '#FB7185',
    expenseSoft: '#2D1518',
    warning: '#FBBF24',
    warningSoft: '#2D2410',
    blue: '#5DD4B5',
    red: '#FB7185',
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

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
} as const;

export const Type = {
  displayLg: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  display: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.3 },
  title: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
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
