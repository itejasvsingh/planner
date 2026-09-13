import { Colors } from '@/constants/theme';
import { useThemeMode } from '@/lib/theme-context';

export function useTheme() {
  return Colors[useThemeMode().scheme];
}
