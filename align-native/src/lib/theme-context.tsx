import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { getItem, setItem } from './storage';

type ThemeMode = 'system' | 'light' | 'dark';
const ThemeModeContext = createContext<{ mode: ThemeMode; scheme: 'light' | 'dark'; setMode: (mode: ThemeMode) => void }>({ mode: 'system', scheme: 'light', setMode: () => {} });

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, updateMode] = useState<ThemeMode>('system');
  useEffect(() => { let active = true; void getItem('align_theme_mode').then(value => { if (active && (value === 'light' || value === 'dark')) updateMode(value); }); return () => { active = false; }; }, []);
  const setMode = (next: ThemeMode) => { updateMode(next); void setItem('align_theme_mode', next); };
  const scheme = mode === 'system' ? system === 'dark' ? 'dark' : 'light' : mode;

  // Keep the page's own background (see global.css) in sync with the in-app theme
  // choice, not just the OS-level prefers-color-scheme — otherwise forcing dark mode
  // while the device/browser is set to light leaves a light strip wherever the RN
  // view tree doesn't fully cover the page (e.g. the safe-area inset at the bottom).
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', scheme);
    }
  }, [scheme]);

  return <ThemeModeContext.Provider value={{ mode, scheme, setMode }}>{children}</ThemeModeContext.Provider>;
}
export function useThemeMode() { return useContext(ThemeModeContext); }
