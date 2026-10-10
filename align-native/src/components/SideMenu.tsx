import type { ComponentType } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInLeft } from 'react-native-reanimated';
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

/** Side menu from the avatar button: who's signed in, the settings pages, appearance, log out. */
export default function SideMenu() {
  const open = useSideMenuOpen();
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone, firebaseUser, logout } = usePhone();
  const { mode, setMode } = useThemeMode();

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
    <Modal visible={open} transparent animationType="none" onRequestClose={() => setSideMenuOpen(false)}>
      <View style={styles.root}>
        <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
          <Pressable accessibilityLabel="Close menu" style={StyleSheet.absoluteFill} onPress={() => setSideMenuOpen(false)} />
        </Animated.View>
        <Animated.View entering={SlideInLeft.duration(240)} style={[styles.panel, { backgroundColor: c.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  panel: { width: '82%', maxWidth: 340, paddingHorizontal: 12, borderTopRightRadius: Radius.xl, borderBottomRightRadius: Radius.xl },
  head: { gap: 4, paddingHorizontal: 8, paddingBottom: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, minHeight: 48 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
});
