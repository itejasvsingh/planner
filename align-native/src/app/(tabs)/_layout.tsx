import NotificationsManager from '@/components/NotificationsManager';
import QuickAddBar from '@/components/QuickAddBar';
import { Colors, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Calendar, ListTodo, Target, Wallet } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function useWebSafeAreaBottom(): number {
  const [sab, setSab] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;';
    document.body.appendChild(el);
    const h = el.getBoundingClientRect().height;
    document.body.removeChild(el);
    setSab(h);
  }, []);
  return sab;
}

export default function TabsLayout() {
  const { isDark } = useTheme();
  const c = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const webSab = useWebSafeAreaBottom();
  // On web, react-native-safe-area-context often returns bottom=0;
  // measure the real CSS env(safe-area-inset-bottom) instead
  const bottomInset = Platform.OS === 'web' ? Math.max(insets.bottom, webSab) : insets.bottom;
  
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
            lineHeight: 13,
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
            height: 60 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 0,
            marginBottom: 0,
          },
          tabBarItemStyle: {
            height: 60,
            paddingTop: 4,
            paddingBottom: 2,
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
