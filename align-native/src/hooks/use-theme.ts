import { Colors } from '@/constants/theme';
import { useThemeMode } from '@/lib/theme-context';

export function useTheme() {
  const { scheme } = useThemeMode();
  return { ...Colors[scheme], isDark: scheme === 'dark' };
}
