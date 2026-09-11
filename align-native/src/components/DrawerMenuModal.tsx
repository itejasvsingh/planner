import { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated, Dimensions, Switch, Alert, ScrollView } from 'react-native';
import { LogOut, Shield, MessageCircle, Moon, Sun, Bell, Smartphone, Download, Repeat, ChevronRight, Star, Calendar, Wallet, Target } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { doc, onSnapshot } from 'firebase/firestore';

import { useTheme } from '@/hooks/use-theme';
import { Appearance } from 'react-native';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { triggerHaptic } from '@/lib/haptics';
import { db, auth } from '@/lib/firebase';
import { isSecurityEnabled } from '@/lib/auth';

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
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr.padStart(2, '0')} ${ampm}`;
}

export default function DrawerMenuModal({ visible, onClose }: DrawerMenuModalProps) {
  const theme = useTheme();
  const { phone, logout } = usePhone();
  const { items } = usePlannerItems(phone);
  const router = useRouter();

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // State
  const [pushEnabled, setPushEnabled] = useState(false);
  const [autoPushEnabled, setAutoPushEnabled] = useState(false);
  const [themeMode, setThemeMode] = useState(Appearance.getColorScheme() || 'system');
  const [exportMsg, setExportMsg] = useState('JSON');
  
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
    Notifications.getPermissionsAsync().then(({ status }) => {
      setPushEnabled(status === 'granted');
    });
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

  const cycleTheme = () => {
    triggerHaptic('light');
    const current = Appearance.getColorScheme();
    const next = current === 'dark' ? 'light' : 'dark';
    Appearance.setColorScheme(next);
    setThemeMode(next);
  };

  const handleExportData = async () => {
    triggerHaptic('medium');
    setExportMsg('Exporting...');
    try {
      const jsonString = JSON.stringify(items, null, 2);
      const filename = `align_export_${new Date().toISOString().split('T')[0]}.json`;
      const file = new FileSystem.File(FileSystem.Paths.document, filename);
      file.write(jsonString);
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(file.uri, { UTI: 'public.json', mimeType: 'application/json' });
        setExportMsg('✓ Done');
      } else {
        setExportMsg('Failed');
        Alert.alert('Export', 'Sharing not available on this device');
      }
    } catch (e) {
      setExportMsg('Failed');
      Alert.alert('Export Error', 'Failed to export data');
    }
    setTimeout(() => setExportMsg('JSON'), 3000);
  };

  const formattedPhone = phone ? (phone.length > 10 ? `+${phone.slice(0, phone.length - 10)} ` : '') + `******${phone.slice(-4)}` : '';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.drawer, { backgroundColor: theme.background, transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.header}>
            <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
              <Smartphone color={theme.text} size={24} />
            </View>
            <View style={styles.accountInfo}>
              <Text style={[styles.phoneText, { color: theme.text }]}>{formattedPhone}</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Cloud Synced</Text>
              </View>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Views / Navigation */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Views</Text>

              <Pressable
                style={[styles.menuItem, { borderBottomColor: theme.border }]}
                onPress={() => navigateTo('/')}>
                <Star color={theme.blue} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Daily Agenda</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Today's tasks & schedule</Text>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </Pressable>

              <Pressable
                style={[styles.menuItem, { borderBottomColor: theme.border }]}
                onPress={() => navigateTo('/calendar')}>
                <Calendar color={theme.blue} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Calendar</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Monthly view & schedule</Text>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </Pressable>

              <Pressable
                style={[styles.menuItem, { borderBottomColor: theme.border }]}
                onPress={() => navigateTo('/finance')}>
                <Wallet color={theme.blue} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Expense Tracker & Finance</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Track spending, budgets & splits</Text>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </Pressable>

              <Pressable
                style={[styles.menuItem, { borderBottomColor: theme.border }]}
                onPress={() => navigateTo('/goals')}>
                <Target color={theme.blue} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Goals</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Milestones & targets</Text>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </Pressable>
            </View>

            {/* Preferences */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Preferences</Text>
              
              <View style={[styles.menuItem, { borderBottomColor: theme.border }]}>
                <Bell color={theme.text} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Local Reminders</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Notify me for scheduled tasks</Text>
                </View>
                <Switch value={pushEnabled} onValueChange={handleTogglePush} />
              </View>

              <Pressable
                style={[styles.menuItem, { borderBottomColor: theme.border }]}
                onPress={() => {
                  onClose();
                  router.push('/settings/notifications');
                }}>
                <Bell color={theme.text} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Notification Settings</Text>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </Pressable>

              <View style={[styles.menuItem, { borderBottomColor: theme.border }]}>
                <Repeat color={theme.text} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Auto-Push Rollover</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Move unfinished tasks to tomorrow</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: autoPushEnabled ? '#34C759' : theme.backgroundElement }]}>
                  <Text style={[styles.badgeText, { color: autoPushEnabled ? '#FFFFFF' : theme.textSecondary }]}>{autoPushEnabled ? 'ON' : 'OFF'}</Text>
                </View>
              </View>
              
              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={cycleTheme}>
                {themeMode === 'dark' ? <Moon color={theme.text} size={22} /> : <Sun color={theme.text} size={22} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Appearance</Text>
                </View>
                <Text style={{ color: theme.textSecondary, textTransform: 'capitalize', fontWeight: '600' }}>{themeMode}</Text>
              </Pressable>

              <Pressable
                style={[styles.menuItem, { borderBottomColor: theme.border }]}
                onPress={() => {
                  Alert.alert(
                    'Install Align on iOS',
                    'To install Align with full Dynamic Island & full-screen experience:\n\n1. In Safari, tap the Share button (box with upward arrow) at the bottom.\n2. Scroll down and tap "Add to Home Screen".\n3. Tap "Add" in the top right.\n\nThen launch Align directly from your Home Screen!',
                    [{ text: 'Got it' }]
                  );
                }}>
                <Smartphone color={theme.blue} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Add to Home Screen</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>Dynamic Island & full screen setup</Text>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </Pressable>

              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={handleExportData}>
                <Download color={theme.text} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Export Data</Text>
                </View>
                <Text style={{ color: exportMsg.includes('✓') ? '#34C759' : exportMsg === 'Failed' ? '#FF3B30' : theme.textSecondary, fontWeight: '600' }}>
                  {exportMsg}
                </Text>
              </Pressable>
            </View>

            {/* WhatsApp & Bot */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>WhatsApp & Bot</Text>
              
              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/whatsapp')}>
                <MessageCircle color={theme.text} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>WhatsApp Settings</Text>
                  <Text style={[styles.menuSubtext, { color: theme.textSecondary }]}>
                    {dailySummaryEnabled ? `Summary at ${format12Hour(dailySummaryTime)} • Active` : 'Daily summary, reminders & bot'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: dailySummaryEnabled ? '#34C759' : theme.textSecondary, fontWeight: '700' }}>
                    {dailySummaryEnabled ? 'Active' : 'Configure'}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 18, marginBottom: 2 }}>›</Text>
                </View>
              </Pressable>
            </View>

            {/* Security */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Security & Privacy</Text>
              
              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/security')}>
                <Shield color={theme.text} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuText, { color: theme.text }]}>Security</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: securityActive ? '#34C759' : theme.textSecondary, fontWeight: '700' }}>
                    {securityActive ? 'On' : 'Off'}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 18, marginBottom: 2 }}>›</Text>
                </View>
              </Pressable>
            </View>

            <View style={{ height: 40 }} />

            <Pressable style={[styles.menuItem, { borderBottomWidth: 0, paddingTop: 0 }]} onPress={() => { onClose(); logout(); }}>
              <View style={[styles.avatar, { width: 40, height: 40, backgroundColor: 'rgba(255,59,48,0.1)' }]}>
                <LogOut color="#FF3B30" size={20} />
              </View>
              <Text style={[styles.menuText, { color: '#FF3B30', fontWeight: '700' }]}>Log out</Text>
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
  drawer: { width: DRAWER_WIDTH, height: '100%', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 40 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  accountInfo: { flex: 1 },
  phoneText: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34C759' },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 16 },
  menuText: { fontSize: 16, fontWeight: '600' },
  menuSubtext: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  badgeText: { fontSize: 12, fontWeight: '800' }
});
