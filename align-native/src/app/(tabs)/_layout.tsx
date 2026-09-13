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
  const tabHeight = 50;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',
          tabBarItemStyle: {
            paddingTop: 5,
            paddingBottom: 3,
            height: 50,
          },
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
          tabBarStyle: {
            backgroundColor: colors.backgroundElement,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            height: Platform.OS === 'web' ? 50 : (tabHeight + insets.bottom),
            paddingTop: 2,
            paddingBottom: Platform.OS === 'web' ? 0 : insets.bottom,
            marginBottom: 0,
            bottom: 0,
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
