import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { ThemeModeProvider, useThemeMode } from '@/lib/theme-context';
import { Colors } from '@/constants/theme';
import { PhoneProvider, usePhone } from '@/lib/phone-context';
import LockScreen from '@/components/LockScreen';
import { isSecurityEnabled } from '@/lib/auth';

import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

function RootNav() {
  const { scheme: colorScheme } = useThemeMode();
  const { ready, phone } = usePhone();
  const router = useRouter();
  const segments = useSegments();
  
  const [securityReady, setSecurityReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    isSecurityEnabled().then(enabled => {
      setIsLocked(enabled);
      setSecurityReady(true);
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('hasSeenOnboarding').then(val => {
      setHasSeenOnboarding(val === 'true');
    });
  }, [segments]);

  useEffect(() => {
    if (!ready || !securityReady || hasSeenOnboarding === null) return;
    
    // Auth guard routing
    const inTabsGroup = segments[0] === '(tabs)';
    const inSettingsGroup = segments[0] === 'settings';
    
    // First, handle onboarding flow
    if (!hasSeenOnboarding && !phone) {
      if ((segments as string[])[0] !== 'welcome' && (segments as string[])[0] !== 'onboarding') {
        router.replace('/welcome' as any);
      }
      return;
    }
    
    // Once onboarded, regular auth logic
    if (!phone && inTabsGroup) {
      router.replace('/login');
    } else if (phone && !inTabsGroup && !inSettingsGroup ) {
      router.replace('/(tabs)');
    }
  }, [ready, securityReady, phone, segments, hasSeenOnboarding]);

  useEffect(() => {
    if (ready && securityReady && hasSeenOnboarding !== null) {
      void SplashScreen.hideAsync();
    }
  }, [ready, securityReady, hasSeenOnboarding]);

  if (!ready || !securityReady || hasSeenOnboarding === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors[colorScheme].background }}>
        <ActivityIndicator color={Colors[colorScheme].accent} />
      </View>
    );
  }

  // If locked, render the LockScreen entirely over the app
  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} currentPhone={phone} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </ThemeProvider>
  );
}

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeModeProvider>
        <PhoneProvider>
          <RootNav />
        </PhoneProvider>
        </ThemeModeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
