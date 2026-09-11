import { Tabs } from 'expo-router';
import { useColorScheme, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Star, Calendar, Wallet, Target } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import QuickAddBar from '@/components/QuickAddBar';
import NotificationsManager from '@/components/NotificationsManager';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  
  // Sleek, compact 56px tab bar with no excessive bottom void
  const tabHeight = 56;
  const bottomPadding = 6;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',
          tabBarItemStyle: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          },
          tabBarIconStyle: {
            width: 24,
            height: 24,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 2,
            lineHeight: 12,
          },
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            paddingTop: 3,
            paddingBottom: bottomPadding,
            height: tabHeight,
          },
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.textSecondary,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Daily',
            tabBarLabel: 'Daily',
            tabBarIcon: ({ color }) => <Star color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarLabel: 'Calendar',
            tabBarIcon: ({ color }) => <Calendar color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="finance"
          options={{
            title: 'Expenses',
            tabBarLabel: 'Expenses',
            tabBarIcon: ({ color }) => <Wallet color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: 'Goals',
            tabBarLabel: 'Goals',
            tabBarIcon: ({ color }) => <Target color={color} size={22} />,
          }}
        />
      </Tabs>

      <QuickAddBar />
      <NotificationsManager />
    </>
  );
}
