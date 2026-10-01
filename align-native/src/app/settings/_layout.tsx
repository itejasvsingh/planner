import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, Text, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

/** iOS-style "‹ Back" for the web, where the stack otherwise shows a Material arrow. */
function WebBackButton() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', marginLeft: 4, opacity: pressed ? 0.5 : 1 })}
    >
      <ChevronLeft color={theme.accent} size={28} strokeWidth={2.2} />
      <Text style={{ color: theme.accent, fontSize: 17, marginLeft: -4 }}>Back</Text>
    </Pressable>
  );
}

export default function SettingsLayout() {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // Native stacks slide on their own; on the web, slide the settings section in from the right
  const slide = useRef(new Animated.Value(Platform.OS === 'web' ? width : 0)).current;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    Animated.timing(slide, { toValue: 0, duration: 280, useNativeDriver: false }).start();
  }, [slide]);

  return (
    <Animated.View style={{ flex: 1, backgroundColor: theme.background, transform: [{ translateX: slide }] }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.accent,
          headerTitleStyle: { color: theme.text },
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerBackTitle: 'Back',
          animation: 'slide_from_right',
          ...(Platform.OS === 'web' ? { headerLeft: () => <WebBackButton /> } : {}),
        }}>
        <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitle: true, headerLargeTitleShadowVisible: false }} />
        <Stack.Screen name="security" options={{ title: 'App Lock' }} />
        <Stack.Screen name="whatsapp" options={{ title: 'WhatsApp' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="sms" options={{ title: 'SMS Auto-Import' }} />
      </Stack>
    </Animated.View>
  );
}
