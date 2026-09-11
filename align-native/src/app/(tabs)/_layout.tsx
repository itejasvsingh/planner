import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Star, Calendar, Wallet, Target } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import QuickAddBar from '@/components/QuickAddBar';
import NotificationsManager from '@/components/NotificationsManager';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const insets = useSafeAreaInsets();
  
  // Clean, ultra-compact 50px tab bar with zero bottom safe area space
  const tabHeight = 50;

  // Explicitly ignore and eliminate bottom safe area inset for tab bar flush alignment
  const flushInsets = {
    top: insets.top,
    left: insets.left,
    right: insets.right,
    bottom: 0,
  };

  return (
    <SafeAreaInsetsContext.Provider value={flushInsets}>
      <Tabs
        // @ts-ignore - pass safeAreaInsets directly to BottomTabView navigator
        safeAreaInsets={flushInsets}
        screenOptions={{
          // @ts-ignore
          safeAreaInsets: flushInsets,
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',
          tabBarItemStyle: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 0,
            paddingBottom: 0,
          },
          tabBarIconStyle: {
            width: 24,
            height: 24,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 1,
            lineHeight: 12,
          },
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            paddingTop: 0,
            paddingBottom: 0,
            height: tabHeight,
            marginBottom: 0,
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
    </SafeAreaInsetsContext.Provider>
  );
}
