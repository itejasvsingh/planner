import { useEffect, useState, type ComponentType } from 'react';
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { clamp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Download, Mail, MessageSquareText, MessageCircle, Moon, Settings, Shield, LogOut, type LucideProps } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { usePhone } from '@/lib/phone-context';
import { useThemeMode } from '@/lib/theme-context';
import { setSideMenuOpen, useSideMenuOpen } from '@/lib/side-menu-state';

const LINKS: { label: string; path: string; Icon: ComponentType<LucideProps> }[] = [
  { label: 'Notifications', path: '/settings/notifications', Icon: Bell },
  { label: 'WhatsApp', path: '/settings/whatsapp', Icon: MessageCircle },
  { label: 'SMS auto-import', path: '/settings/sms', Icon: MessageSquareText },
  { label: 'Gmail', path: '/settings/gmail', Icon: Mail },
  { label: 'Import statement', path: '/settings/import', Icon: Download },
  { label: 'App lock', path: '/settings/security', Icon: Shield },
];

const NEXT_MODE = { system: 'light', light: 'dark', dark: 'system' } as const;
const MODE_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;

const SPRING = { duration: 300, dampingRatio: 1 } as const; // no overshoot: the panel is off-screen at one end

/** Side menu from the avatar button: who's signed in, the settings pages, appearance, log out. Drag it left to close. */
export default function SideMenu() {
  const open = useSideMenuOpen();
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone, firebaseUser, logout } = usePhone();
  const { mode, setMode } = useThemeMode();
  const { width: screenW } = useWindowDimensions();
  const panelW = Math.min(screenW * 0.82, 340);

  // progress: 0 = hidden, 1 = open. The panel stays mounted until the close animation ends.
  const [mounted, setMounted] = useState(false);
  const progress = useSharedValue(0);
  const startProgress = useSharedValue(0);
  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.set(withSpring(1, SPRING));
    } else if (mounted) {
      progress.set(withSpring(0, SPRING, (done) => { if (done) scheduleOnRN(setMounted, false); }));
      // the animation's end callback can be starved on a busy or backgrounded page: never leave the overlay up
      const t = setTimeout(() => setMounted(false), 700);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const drag = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onStart(() => { startProgress.set(progress.get()); })
    .onUpdate((e) => { progress.set(clamp(startProgress.get() + e.translationX / panelW, 0, 1)); })
    .onEnd((e) => {
      // a flick is enough to close, as is dragging past halfway
      const close = e.velocityX < -500 || (e.velocityX < 500 && progress.get() < 0.5);
      progress.set(withSpring(close ? 0 : 1, { ...SPRING, velocity: e.velocityX / panelW }, (done) => { if (done && close) scheduleOnRN(setSideMenuOpen, false); }));
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.get() - 1) * panelW }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  const maskedPhone = phone ? (phone.length > 10 ? `+${phone.slice(0, phone.length - 10)} ` : '') + `******${phone.slice(-4)}` : '';
  const name = firebaseUser?.displayName || firebaseUser?.email || maskedPhone || 'Personal workspace';
  const sub = firebaseUser?.email ? (maskedPhone || 'Google account') : maskedPhone ? 'Signed in with WhatsApp' : 'Guest';
  const initial = (firebaseUser?.displayName || firebaseUser?.email || maskedPhone || 'A').trim().replace(/^\+/, '').charAt(0).toUpperCase();

  const go = (path: string) => { setSideMenuOpen(false); router.push(path as never); };
  const signOut = () => { setSideMenuOpen(false); logout(); router.replace('/login'); };

  const row = (label: string, Icon: ComponentType<LucideProps>, onPress: () => void, opts?: { value?: string; destructive?: boolean }) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.row}>
      <Icon color={opts?.destructive ? c.red : c.textSecondary} size={20} />
      <Text style={{ flex: 1, color: opts?.destructive ? c.red : c.text, fontSize: 16, fontWeight: '500' }}>{label}</Text>
      {!!opts?.value && <Text style={{ color: c.textSecondary, fontSize: 14 }}>{opts.value}</Text>}
    </Pressable>
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={() => setSideMenuOpen(false)}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }, scrimStyle]}>
          <Pressable accessibilityLabel="Close menu" style={StyleSheet.absoluteFill} onPress={() => setSideMenuOpen(false)} />
        </Animated.View>
        <GestureDetector gesture={drag}>
        <Animated.View style={[styles.panel, { width: panelW, backgroundColor: c.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }, panelStyle]}>
          <View style={styles.head}>
            <View style={[styles.avatar, { backgroundColor: c.accentFill }]}>
              <Text style={{ color: c.onAccent, fontSize: 22, fontWeight: '700' }}>{initial}</Text>
            </View>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>{name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>{sub}</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {row('Settings', Settings, () => go('/settings'))}
            <View style={[styles.rule, { backgroundColor: c.border }]} />
            {LINKS.map(l => row(l.label, l.Icon, () => go(l.path)))}
            <View style={[styles.rule, { backgroundColor: c.border }]} />
            {row('Appearance', Moon, () => setMode(NEXT_MODE[mode]), { value: MODE_LABEL[mode] })}
          </ScrollView>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          {row('Log out', LogOut, signOut, { destructive: true })}
        </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  panel: { paddingHorizontal: 12, borderTopRightRadius: Radius.xl, borderBottomRightRadius: Radius.xl },
  head: { gap: 4, paddingHorizontal: 8, paddingBottom: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, minHeight: 48 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
});
