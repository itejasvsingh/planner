import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated, Dimensions, Switch, Alert, ScrollView, Platform } from 'react-native';
import { LogOut, Shield, MessageCircle, Moon, Sun, Bell, Smartphone, Repeat, ChevronRight, X, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

import { useTheme } from '@/hooks/use-theme';
import { useThemeMode } from '@/lib/theme-context';
import { usePhone } from '@/lib/phone-context';
import { triggerHaptic } from '@/lib/haptics';
import { db } from '@/lib/firebase';
import { isSecurityEnabled } from '@/lib/auth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signInWithGoogle } from '@/lib/google-auth';

interface DrawerMenuModalProps {
  visible: boolean;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 400);

export function format12Hour(timeStr: string) {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr.padStart(2, '0')} ${ampm}`;
}

export default function DrawerMenuModal({ visible, onClose }: DrawerMenuModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { phone, firebaseUser, logout } = usePhone();
  const router = useRouter();

  const topPadding = Platform.OS === 'web'
    ? insets.top + 8
    : Math.max(insets.top, 52);

  const [slideAnim] = useState(() => new Animated.Value(-DRAWER_WIDTH));
  const [fadeAnim] = useState(() => new Animated.Value(0));

  // State
  const [pushEnabled, setPushEnabled] = useState(false);
  const [autoPushEnabled, setAutoPushEnabled] = useState(false);
  const { mode: themeMode, scheme, setMode } = useThemeMode();
  
  const [securityActive, setSecurityActive] = useState(false);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [dailySummaryTime, setDailySummaryTime] = useState('22:00');

  useEffect(() => {
    isSecurityEnabled().then(setSecurityActive);
  }, [visible]);

  useEffect(() => {
    if (!phone) return;
    const unsubscribe = onSnapshot(
      doc(db, 'planner_settings', `preferences_${phone}`),
      (d) => {
        if (d.exists()) {
          const data = d.data();
          if (typeof data?.autoPushEnabled === 'boolean') setAutoPushEnabled(data.autoPushEnabled);
          if (typeof data?.dailySummaryEnabled === 'boolean') setDailySummaryEnabled(data.dailySummaryEnabled);
          if (data?.dailySummaryTime) setDailySummaryTime(data.dailySummaryTime);
        }
      },
      (err) => {
        console.warn('DrawerMenu preferences notice:', err);
      }
    );
    return () => unsubscribe();
  }, [phone]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getPermissionsAsync().then(({ status }) => {
      setPushEnabled(status === 'granted');
    }).catch(() => setPushEnabled(false));
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 250, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const navigateTo = (route: any) => {
    onClose();
    setTimeout(() => router.push(route), 300);
  };

  const handleTogglePush = async () => {
    triggerHaptic('light');
    if (!pushEnabled) {
      const { status } = await Notifications.requestPermissionsAsync();
      setPushEnabled(status === 'granted');
      if (status !== 'granted') Alert.alert('Permission required', 'Please enable notifications in your phone settings.');
    } else {
      Alert.alert('Settings', 'Please disable notifications in your phone settings.');
    }
  };

  const handleToggleAutoPush = async () => {
    triggerHaptic('light');
    const next = !autoPushEnabled;
    setAutoPushEnabled(next);
    if (phone) {
      try {
        await Promise.all([
          setDoc(doc(db, 'planner_settings', `preferences_${phone}`), { autoPushEnabled: next }, { merge: true }),
          setDoc(doc(db, 'user_sessions', phone), { autoPushEnabled: next }, { merge: true })
        ]);
      } catch (e) {
        console.warn('Error saving autoPush in drawer:', e);
      }
    }
  };

  const cycleTheme = () => {
    triggerHaptic('light');
    setMode(themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system');
  };



  const formattedPhone = phone ? (phone.length > 10 ? `+${phone.slice(0, phone.length - 10)} ` : '') + `******${phone.slice(-4)}` : '';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.drawer, { backgroundColor: theme.background, borderRightColor: theme.border, paddingTop: topPadding, transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.brandRow}>
            <View style={[styles.brandMark, { backgroundColor: theme.accentFill }]}>
              <Check size={14} color={theme.onAccent} strokeWidth={3.5} />
            </View>
            <Text style={[styles.brandText, { color: theme.text }]}>align.</Text>
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.backgroundMuted }]}><X size={18} color={theme.textSecondary} /></Pressable>
          </View>

          <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.backgroundMuted }]}>
              <Smartphone color={theme.text} size={20} />
            </View>
            <View style={styles.accountInfo}>
              <Text style={[styles.phoneText, { color: theme.text }]} numberOfLines={1}>
                {firebaseUser?.displayName || firebaseUser?.email || formattedPhone || 'Personal Workspace'}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: firebaseUser ? theme.income : theme.warning }]} />
                <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                  {firebaseUser?.email && formattedPhone ? formattedPhone : firebaseUser ? 'Google Account' : formattedPhone ? 'WhatsApp Synced' : 'Guest'}
                </Text>
              </View>
            </View>
          </View>

          {!firebaseUser && (
            <Pressable
              onPress={async () => {
                try {
                  const u = await signInWithGoogle();
                  if (u) {
                    triggerHaptic('success');
                    Alert.alert('Signed In', `Welcome, ${u.displayName || u.email || 'friend'}!`);
                  }
                } catch (e: any) {
                  Alert.alert('Sign In Notice', e.message || 'Could not complete Google Sign-In');
                }
              }}
              style={[styles.quickGoogleBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            >
              <Text style={styles.googleG}>G</Text>
              <Text style={[styles.quickGoogleText, { color: theme.text }]}>Sign in with Google</Text>
            </Pressable>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Preferences */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Preferences</Text>
              
              {Platform.OS !== 'web' && (
              <View style={[styles.menuItem, { borderBottomColor: theme.border }]}>
                <Bell color={theme.textSecondary} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Local Reminders</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Notify me for scheduled tasks</Text>
                </View>
                <Switch value={pushEnabled} onValueChange={handleTogglePush} trackColor={{ false: theme.backgroundMuted, true: theme.accentFill }} ios_backgroundColor={theme.backgroundMuted} />
              </View>
              )}

              <Pressable
                style={[styles.menuItem, { borderBottomColor: theme.border }]}
                onPress={() => {
                  onClose();
                  router.push('/settings/notifications');
                }}>
                <Bell color={theme.textSecondary} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Notification Settings</Text>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </Pressable>

              <View style={[styles.menuItem, { borderBottomColor: theme.border }]}>
                <Repeat color={theme.textSecondary} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Auto-Push Rollover</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Move unfinished tasks to tomorrow</Text>
                </View>
                <Switch value={autoPushEnabled} onValueChange={handleToggleAutoPush} trackColor={{ false: theme.backgroundMuted, true: theme.accentFill }} ios_backgroundColor={theme.backgroundMuted} />
              </View>
              
              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={cycleTheme}>
                {scheme === 'dark' ? <Moon color={theme.textSecondary} size={20} /> : <Sun color={theme.textSecondary} size={20} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Appearance</Text>
                </View>
                <Text style={{ color: theme.textSecondary, textTransform: 'capitalize', fontWeight: '600' }}>{themeMode}</Text>
              </Pressable>
            </View>

            {/* WhatsApp & Bot */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>WhatsApp & Bot</Text>
              
              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/whatsapp')}>
                <MessageCircle color={theme.textSecondary} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>WhatsApp Settings</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>
                    {dailySummaryEnabled ? `Summary at ${format12Hour(dailySummaryTime)} • Active` : 'Daily summary, reminders & bot'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: dailySummaryEnabled ? theme.accent : theme.textSecondary, fontWeight: '700' }}>
                    {dailySummaryEnabled ? 'Active' : 'Configure'}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 18, marginBottom: 2 }}>›</Text>
                </View>
              </Pressable>
            </View>

            {/* Security */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>Security & Privacy</Text>
              
              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/security')}>
                <Shield color={theme.textSecondary} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Security</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: securityActive ? theme.accent : theme.textSecondary, fontWeight: '700' }}>
                    {securityActive ? 'On' : 'Off'}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 18, marginBottom: 2 }}>›</Text>
                </View>
              </Pressable>
            </View>

            <View style={{ height: 40 }} />

            <Pressable 
              style={[styles.menuItem, { borderBottomWidth: 0, paddingTop: 0 }]} 
              onPress={() => { 
                onClose(); 
                logout(); 
                router.replace('/login');
              }}
            >
              <View style={[styles.avatar, { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.expenseSoft }]}>
                <LogOut color={theme.red} size={18} />
              </View>
              <Text style={[styles.menuText, { color: theme.red, fontWeight: '700' }]}>
                {phone || firebaseUser ? 'Log out / Switch account' : 'Sign in'}
              </Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: { width: DRAWER_WIDTH, height: '100%', paddingHorizontal: 18, paddingBottom: 40, borderRightWidth: 1, shadowColor: '#000', shadowOffset: { width: 6, height: 0 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  brandMark: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickGoogleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    gap: 10,
  },
  googleG: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4285F4',
  },
  quickGoogleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, padding: 12, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  accountInfo: { flex: 1 },
  phoneText: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  menuText: { fontSize: 15, fontWeight: '600' },
  menuSubtext: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  badgeText: { fontSize: 12, fontWeight: '800' }
});
