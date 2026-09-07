import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsLayout() {
  const theme = useTheme();
  
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="security" options={{ title: 'Security' }} />
      <Stack.Screen name="whatsapp" options={{ title: 'WhatsApp' }} />
    </Stack>
  );
}

