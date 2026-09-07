import { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Animated, Dimensions, Switch, Alert, ScrollView } from 'react-native';
import { LogOut, Shield, MessageCircle, Moon, Sun, Bell, RefreshCw, Smartphone, Download, Settings, Repeat } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { triggerHaptic } from '@/lib/haptics';
import { db } from '@/lib/firebase';
import { Appearance } from 'react-native';

interface DrawerMenuModalProps {
  visible: boolean;
  onClose: () => void;
}

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.75;

export default function DrawerMenuModal({ visible, onClose }: DrawerMenuModalProps) {
  const theme = useTheme();
  const { phone, logout } = usePhone();
  const { items } = usePlannerItems(phone);
  const router = useRouter();
  
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [pushEnabled, setPushEnabled] = useState(false);
  const [autoPushEnabled, setAutoPushEnabled] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      if (!phone) return;
      const { status } = await Notifications.getPermissionsAsync();
      setPushEnabled(status === 'granted');

      try {
        const prefDoc = await getDoc(doc(db, 'planner_settings', `preferences_${phone}`));
        if (prefDoc.exists()) {
          const data = prefDoc.data();
          setAutoPushEnabled(!!data.autoPushEnabled);
        }
      } catch (e) {
        console.warn('Failed to load preferences', e);
      }
    }
    if (visible) {
      loadSettings();
    }
  }, [phone, visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 250, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true })
      ]).start();
    }
  }, [visible]);

  if (!visible && slideAnim.setOffset === undefined) return null;

  const navigateTo = (path: any) => {
    onClose();
    setTimeout(() => router.push(path), 300);
  };

  const savePreferences = async (patch: any) => {
    if (!phone) return;
    try {
      await setDoc(doc(db, 'planner_settings', `preferences_${phone}`), patch, { merge: true });
    } catch (e) {
      console.warn('Failed to save preference', e);
    }
  };

  const handleTogglePush = async () => {
    triggerHaptic('light');
    if (!pushEnabled) {
      const { status } = await Notifications.requestPermissionsAsync();
      setPushEnabled(status === 'granted');
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please enable notifications in your phone settings.');
      }
    } else {
      Alert.alert('Settings', 'Please disable notifications in your phone settings.');
    }
  };

  const handleToggleAutoPush = () => {
    triggerHaptic('light');
    const next = !autoPushEnabled;
    setAutoPushEnabled(next);
    savePreferences({ autoPushEnabled: next });
  };

  const [themeMode, setThemeMode] = useState(Appearance.getColorScheme() || 'system');

  const cycleTheme = () => {
    triggerHaptic('light');
    const current = Appearance.getColorScheme();
    const next = current === 'dark' ? 'light' : 'dark';
    Appearance.setColorScheme(next);
    setThemeMode(next);
  };

  const handleManualSync = () => {
    triggerHaptic('medium');
    Alert.alert('Sync', 'Manual sync triggered (normally handled by real-time listener)');
  };

  const handleExportData = async () => {
    triggerHaptic('medium');
    try {
      const jsonString = JSON.stringify(items, null, 2);
      const filename = `align_export_${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = (FileSystem.documentDirectory || '') + filename;
      
      await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
      
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, { UTI: 'public.json', mimeType: 'application/json' });
      } else {
        Alert.alert('Export', 'Sharing not available on this device');
      }
    } catch (e) {
      console.warn(e);
      Alert.alert('Export Error', 'Failed to export data');
    }
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
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Settings</Text>
              
              <View style={[styles.menuItem, { borderBottomColor: theme.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                  <Bell color={theme.text} size={22} />
                  <Text style={[styles.menuText, { color: theme.text }]}>Local Reminders</Text>
                </View>
                <Switch value={pushEnabled} onValueChange={handleTogglePush} />
              </View>

              <View style={[styles.menuItem, { borderBottomColor: theme.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                  <Repeat color={theme.text} size={22} />
                  <Text style={[styles.menuText, { color: theme.text }]}>Auto-Push Tasks</Text>
                </View>
                <Switch value={autoPushEnabled} onValueChange={handleToggleAutoPush} />
              </View>
              
              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={cycleTheme}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                  {themeMode === 'dark' ? <Moon color={theme.text} size={22} /> : <Sun color={theme.text} size={22} />}
                  <Text style={[styles.menuText, { color: theme.text }]}>Appearance</Text>
                </View>
                <Text style={{ color: theme.textSecondary, textTransform: 'capitalize' }}>{themeMode}</Text>
              </Pressable>

              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={handleExportData}>
                <Download color={theme.text} size={22} />
                <Text style={[styles.menuText, { color: theme.text }]}>Export JSON Data</Text>
              </Pressable>

              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={handleManualSync}>
                <RefreshCw color={theme.text} size={22} />
                <Text style={[styles.menuText, { color: theme.text }]}>Sync Database</Text>
              </Pressable>

              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/whatsapp')}>
                <MessageCircle color={theme.text} size={22} />
                <Text style={[styles.menuText, { color: theme.text }]}>WhatsApp & Bot</Text>
              </Pressable>

              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/security')}>
                <Shield color={theme.text} size={22} />
                <Text style={[styles.menuText, { color: theme.text }]}>Security & Privacy</Text>
              </Pressable>

              <Pressable style={[styles.menuItem, { borderBottomColor: theme.border }]} onPress={() => navigateTo('/settings/notifications')}>
                <Settings color={theme.text} size={22} />
                <Text style={[styles.menuText, { color: theme.text }]}>Advanced Settings</Text>
              </Pressable>
            </View>

            <View style={{ height: 40 }} />

            <Pressable style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => { onClose(); logout(); }}>
              <LogOut color={theme.red} size={22} />
              <Text style={[styles.menuText, { color: theme.red, fontWeight: '700' }]}>Log out</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 40,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  phoneText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  }
});
