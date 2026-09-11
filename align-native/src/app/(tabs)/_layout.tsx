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
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const bottomPadding = isWeb ? 28 : Math.max(insets.bottom, 12);
  const tabHeight = isWeb ? 84 : 54 + bottomPadding;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarItemStyle: {
            paddingTop: 4,
            paddingBottom: 2,
            height: 46,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            marginTop: 2,
            lineHeight: 14,
          },
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            paddingTop: 4,
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
            tabBarIcon: ({ color }) => <Star color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ color }) => <Calendar color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="finance"
          options={{
            title: 'Expenses',
            tabBarIcon: ({ color }) => <Wallet color={color} size={22} />,
          }}
        />
        <Tabs.Screen
          name="goals"
          options={{
            title: 'Goals',
            tabBarIcon: ({ color }) => <Target color={color} size={22} />,
          }}
        />
      </Tabs>

      <QuickAddBar />
      <NotificationsManager />
    </>
  );
}
