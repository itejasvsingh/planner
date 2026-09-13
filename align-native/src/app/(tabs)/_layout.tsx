import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListTodo, Calendar, Wallet, Target } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import QuickAddBar from '@/components/QuickAddBar';
import NotificationsManager from '@/components/NotificationsManager';

export default function TabsLayout() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const tabHeight = 52;

  return (
    <SafeAreaInsetsContext.Provider value={{ top: insets.top, left: insets.left, right: insets.right, bottom: 0 }}>
      <Tabs
        // @ts-ignore
        safeAreaInsets={{ bottom: 0 }}
        screenOptions={{
          // @ts-ignore
          safeAreaInsets: { bottom: 0 },
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',
          tabBarItemStyle: {
            paddingTop: 4,
            paddingBottom: 4,
          },
          tabBarIconStyle: {
            width: 24,
            height: 22,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 1,
            lineHeight: 12,
          },
          tabBarStyle: {
            backgroundColor: colors.backgroundElement,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            height: Platform.OS === 'web' ? ('calc(52px + env(safe-area-inset-bottom, 0px))' as any) : (tabHeight + insets.bottom),
            paddingTop: 2,
            paddingBottom: Platform.OS === 'web' ? ('env(safe-area-inset-bottom, 0px)' as any) : Math.max(2, insets.bottom),
            marginBottom: 0,
            bottom: 0,
          },
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.textSecondary,
        }}>
        <Tabs.Screen name="index" options={{ title: 'Agenda', tabBarLabel: 'Agenda', tabBarIcon: ({ color }) => <ListTodo color={color} size={21} /> }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarLabel: 'Calendar', tabBarIcon: ({ color }) => <Calendar color={color} size={21} /> }} />
        <Tabs.Screen name="finance" options={{ title: 'Finance', tabBarLabel: 'Finance', tabBarIcon: ({ color }) => <Wallet color={color} size={21} /> }} />
        <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarLabel: 'Goals', tabBarIcon: ({ color }) => <Target color={color} size={21} /> }} />
      </Tabs>
      <QuickAddBar />
      <NotificationsManager />
    </SafeAreaInsetsContext.Provider>
  );
}
