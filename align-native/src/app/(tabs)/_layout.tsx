import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListTodo, Calendar, Wallet, Target } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/hooks/use-theme';
import QuickAddBar from '@/components/QuickAddBar';
import NotificationsManager from '@/components/NotificationsManager';
import { Colors, Shadow } from '@/constants/theme';

export default function TabsLayout() {
  const { isDark } = useTheme();
  const c = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  
  const TabIcon = ({ Icon, focused }: any) => (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 32 }}>
      <Icon color={focused ? c.accent : c.textTertiary} size={22} />
      {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent, marginTop: 4 }} />}
    </View>
  );

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',
          tabBarLabelStyle: {
            fontSize: 10,
            marginTop: 2,
            lineHeight: 12,
          },
          tabBarBackground: () => (
            <BlurView tint={isDark ? 'dark' : 'light'} intensity={90} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          ),
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopWidth: 1,
            borderTopColor: c.border,
            ...Shadow.card,
            shadowOffset: { width: 0, height: -2 },
            position: 'absolute' as const,
            bottom: 0,
            left: 0,
            right: 0,
            height: Platform.OS === 'web' ? 54 + 20 : 54 + insets.bottom,
            paddingBottom: Platform.OS === 'web' ? 20 : insets.bottom,
            paddingTop: 0,
            marginBottom: 0,
          },
          tabBarItemStyle: {
            height: 54,
            paddingTop: 4,
            paddingBottom: 4,
            justifyContent: 'center' as const,
            alignItems: 'center' as const,
          },
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.textTertiary,
        }}>
        <Tabs.Screen name="index" options={{ 
          title: 'Agenda', 
          tabBarLabel: 'Agenda', 
          tabBarLabelStyle: { fontWeight: '600' },
          tabBarIcon: ({ focused }) => <TabIcon Icon={ListTodo} focused={focused} /> 
        }} />
        <Tabs.Screen name="calendar" options={{ 
          title: 'Calendar', 
          tabBarLabel: 'Calendar', 
          tabBarLabelStyle: { fontWeight: '600' },
          tabBarIcon: ({ focused }) => <TabIcon Icon={Calendar} focused={focused} /> 
        }} />
        <Tabs.Screen name="finance" options={{ 
          title: 'Finance', 
          tabBarLabel: 'Finance', 
          tabBarLabelStyle: { fontWeight: '600' },
          tabBarIcon: ({ focused }) => <TabIcon Icon={Wallet} focused={focused} /> 
        }} />
        <Tabs.Screen name="goals" options={{ 
          title: 'Goals', 
          tabBarLabel: 'Goals', 
          tabBarLabelStyle: { fontWeight: '600' },
          tabBarIcon: ({ focused }) => <TabIcon Icon={Target} focused={focused} /> 
        }} />
      </Tabs>
      <QuickAddBar />
      <NotificationsManager />
    </>
  );
}
