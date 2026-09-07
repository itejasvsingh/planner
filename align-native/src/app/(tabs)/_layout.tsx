import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Star, Calendar, Wallet, Target } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import QuickAddBar from '@/components/QuickAddBar';
import NotificationsManager from '@/components/NotificationsManager';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            paddingTop: 8,
          },
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.textSecondary,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Daily',
            tabBarIcon: ({ color }) => <Star color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ color }) => <Calendar color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="finance"
          options={{
            title: 'Finance',
            tabBarIcon: ({ color }) => <Wallet color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: 'Goals',
            tabBarIcon: ({ color }) => <Target color={color} size={24} />,
          }}
        />
      </Tabs>

      <QuickAddBar />
      <NotificationsManager />
    </>
  );
}
