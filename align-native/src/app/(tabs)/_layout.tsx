import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListTodo, Calendar, Wallet, Target } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/hooks/use-theme';
import QuickAddBar from '@/components/QuickAddBar';
import NotificationsManager from '@/components/NotificationsManager';

export default function TabsLayout() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const tabHeight = 50;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',

          tabBarIconStyle: {
            width: 24,
            height: 22,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 2,
            lineHeight: 12,
          },
          tabBarBackground: () => (
            <BlurView tint={colors.isDark ? 'dark' : 'light'} intensity={80} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          ),
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            position: 'absolute' as const,
            bottom: 0,
            left: 0,
            right: 0,
            height: Platform.OS === 'web'
              ? ('calc(50px + env(safe-area-inset-bottom, 0px))' as any)
              : (50 + insets.bottom),
            paddingBottom: Platform.OS === 'web'
              ? ('env(safe-area-inset-bottom, 0px)' as any)
              : insets.bottom,
            paddingTop: 0,
            marginBottom: 0,
          },
          tabBarItemStyle: {
            height: 50,
            paddingTop: 6,
            paddingBottom: 4,
            justifyContent: 'center' as const,
            alignItems: 'center' as const,
          },
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.textSecondary,
        }}>
        <Tabs.Screen name="index" options={{ title: 'Agenda', tabBarLabel: 'Agenda', tabBarIcon: ({ color }) => <ListTodo color={color} size={22} /> }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarLabel: 'Calendar', tabBarIcon: ({ color }) => <Calendar color={color} size={22} /> }} />
        <Tabs.Screen name="finance" options={{ title: 'Finance', tabBarLabel: 'Finance', tabBarIcon: ({ color }) => <Wallet color={color} size={22} /> }} />
        <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarLabel: 'Goals', tabBarIcon: ({ color }) => <Target color={color} size={22} /> }} />
      </Tabs>
      <QuickAddBar />
      <NotificationsManager />
    </>
  );
}
