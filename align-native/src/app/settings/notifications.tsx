import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Switch, Alert, Platform, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft, Download } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { triggerHaptic } from '@/lib/haptics';
import { usePlannerItems } from '@/lib/use-planner-items';

export default function NotificationsSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { phone } = usePhone();
  const { items } = usePlannerItems(phone);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(false);
  const [dailySummaryTime, setDailySummaryTime] = useState(new Date());
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
          setDailySummaryEnabled(!!data.dailySummaryEnabled);
          setAutoPushEnabled(!!data.autoPushEnabled);
          if (data.dailySummaryTime) {
            const [h, m] = data.dailySummaryTime.split(':');
            const d = new Date();
            d.setHours(parseInt(h), parseInt(m), 0, 0);
            setDailySummaryTime(d);
          }
        }
      } catch (e) {
        console.warn('Failed to load preferences', e);
      }
    }
    loadSettings();
  }, [phone]);

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

  const handleToggleDailySummary = () => {
    triggerHaptic('light');
    const next = !dailySummaryEnabled;
    setDailySummaryEnabled(next);
    savePreferences({ dailySummaryEnabled: next });
  };

  const handleTimeChange = (_: any, d?: Date) => {
    if (!d) return;
    setDailySummaryTime(d);
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    savePreferences({ dailySummaryTime: timeStr });
  };

  const handleToggleAutoPush = () => {
    triggerHaptic('light');
    const next = !autoPushEnabled;
    setAutoPushEnabled(next);
    savePreferences({ autoPushEnabled: next });
  };

  const handleExportData = async () => {
    triggerHaptic('medium');
    try {
      const jsonString = JSON.stringify(items, null, 2);
      const filename = `align_export_${new Date().toISOString().split('T')[0]}.json`;
      const file = new FileSystem.File(FileSystem.Paths.document, filename);
      
      file.write(jsonString);
      
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(file.uri, { UTI: 'public.json', mimeType: 'application/json' });
      } else {
        Alert.alert('Export', 'Sharing not available on this device');
      }
    } catch (e) {
      console.warn(e);
      Alert.alert('Export Error', 'Failed to export data');
    }
  };

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft color={theme.blue} size={32} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ALERTS</Text>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: theme.text }]}>Enable Local Reminders</Text>
              <Switch value={pushEnabled} onValueChange={handleTogglePush} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>DAILY SUMMARY</Text>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
              <Text style={[styles.rowText, { color: theme.text }]}>Daily Agenda Summary</Text>
              <Switch value={dailySummaryEnabled} onValueChange={handleToggleDailySummary} />
            </View>
            
            {dailySummaryEnabled && (
              <View style={[styles.row, { paddingVertical: 12 }]}>
                <Text style={[styles.rowText, { color: theme.text }]}>Summary Time</Text>
                <DateTimePicker
                  value={dailySummaryTime}
                  mode="time"
                  display="compact"
                  onChange={handleTimeChange}
                />
              </View>
            )}
          </View>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Receive a daily push notification summarizing your upcoming tasks.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>AUTO PUSH</Text>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: theme.text }]}>Auto-push Tasks</Text>
              <Switch value={autoPushEnabled} onValueChange={handleToggleAutoPush} />
            </View>
          </View>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Automatically push undone tasks to the next day.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>DATA</Text>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <Pressable style={styles.row} onPress={handleExportData}>
              <Text style={[styles.rowText, { color: theme.text }]}>Export All Data (JSON)</Text>
              <Download color={theme.blue} size={20} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 16,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginLeft: 4,
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginLeft: 20,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: {
    fontSize: 17,
  },
  footerText: {
    fontSize: 13,
    marginTop: 8,
    marginHorizontal: 20,
  }
});
