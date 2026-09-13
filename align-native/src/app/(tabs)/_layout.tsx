import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListTodo, Calendar, Wallet, Target } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import QuickAddBar from '@/components/QuickAddBar';
import NotificationsManager from '@/components/NotificationsManager';

export default function TabsLayout() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <>
      <Tabs screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarItemStyle: { paddingTop: 4, paddingBottom: 4 },
        tabBarIconStyle: { height: 22, width: 24 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 3, lineHeight: 14, minHeight: 14, flexShrink: 0 },
        tabBarStyle: {
          backgroundColor: colors.backgroundElement,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 4,
        },
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textSecondary,
      }}>
        <Tabs.Screen name="index" options={{ title: 'Agenda', tabBarIcon: ({ color }) => <ListTodo color={color} size={21} /> }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: ({ color }) => <Calendar color={color} size={21} /> }} />
        <Tabs.Screen name="finance" options={{ title: 'Finance', tabBarIcon: ({ color }) => <Wallet color={color} size={21} /> }} />
        <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: ({ color }) => <Target color={color} size={21} /> }} />
      </Tabs>
      <QuickAddBar />
      <NotificationsManager />
    </>
  );
}
