import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

import { PhoneProvider, usePhone } from '@/lib/phone-context';
import LockScreen from '@/components/LockScreen';
import { isSecurityEnabled } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

function RootNav() {
  const colorScheme = useColorScheme();
  const { ready, phone } = usePhone();
  const router = useRouter();
  const segments = useSegments();
  
  const [securityReady, setSecurityReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    isSecurityEnabled().then(enabled => {
      setIsLocked(enabled);
      setSecurityReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready || !securityReady) return;
    
    // Auth guard routing
    const inTabsGroup = segments[0] === '(tabs)';
    const inSettingsGroup = segments[0] === 'settings';
    
    if (!phone && inTabsGroup) {
      router.replace('/login');
    } else if (phone && !inTabsGroup && !inSettingsGroup ) {
      router.replace('/(tabs)');
    }
  }, [ready, securityReady, phone, segments]);

  useEffect(() => {
    if (ready && securityReady) {
      void SplashScreen.hideAsync();
    }
  }, [ready, securityReady]);

  if (!ready || !securityReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F5F7' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // If locked, render the LockScreen entirely over the app
  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} currentPhone={phone} />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="settings" />
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
        <PhoneProvider>
          <RootNav />
        </PhoneProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
