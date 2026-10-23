import { useState, useEffect } from 'react';
import { View, StyleSheet, Switch, Alert, Platform, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { triggerHaptic } from '@/lib/haptics';
import { disablePush, enablePush, pushStatus, sendTestPush, type PushStatus } from '@/lib/web-push';

export default function NotificationsSettingsScreen() {
  const theme = useTheme();
  const { phone } = usePhone();

  const [pushEnabled, setPushEnabled] = useState(false);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(false);
  const [dailySummaryTime, setDailySummaryTime] = useState(new Date());
  const [autoPushEnabled, setAutoPushEnabled] = useState(false);
  // Web and the home-screen app: push notifications for this device
  const [webPush, setWebPush] = useState<PushStatus | null>(null);
  const [webBusy, setWebBusy] = useState(false);
  const [webNote, setWebNote] = useState('');
  useEffect(() => { if (Platform.OS === 'web') pushStatus().then(setWebPush).catch(() => setWebPush('unsupported')); }, []);

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
      await Promise.all([
        setDoc(doc(db, 'planner_settings', `preferences_${phone}`), patch, { merge: true }),
        setDoc(doc(db, 'user_sessions', phone), patch, { merge: true }),
      ]);
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

  const handleToggleWebPush = async () => {
    triggerHaptic('light');
    setWebBusy(true);
    setWebNote('');
    try {
      const next = webPush === 'on' ? await disablePush() : await enablePush();
      setWebPush(next);
      if (next === 'on') setWebNote('Notifications are on for this device.');
    } catch (e) {
      setWebNote((e as Error).message);
    } finally {
      setWebBusy(false);
    }
  };

  const handleTestWebPush = async () => {
    setWebBusy(true);
    setWebNote('');
    try {
      const n = await sendTestPush();
      setWebNote(n > 0 ? 'Sent. It should arrive in a few seconds.' : 'Nothing was delivered. Turn notifications off and on again.');
    } catch (e) {
      setWebNote((e as Error).message);
    } finally {
      setWebBusy(false);
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



  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {Platform.OS === 'web' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PUSH NOTIFICATIONS</Text>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {webPush === 'on' || webPush === 'off' ? (
                <View style={styles.row}>
                  <Text style={[styles.rowText, { color: theme.text }]}>Notify me on this device</Text>
                  <Switch value={webPush === 'on'} disabled={webBusy} onValueChange={() => void handleToggleWebPush()} trackColor={{ false: theme.backgroundMuted, true: theme.accentFill }} ios_backgroundColor={theme.backgroundMuted} />
                </View>
              ) : (
                <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
                  <Text style={{ color: webPush === 'denied' || webPush === 'not-configured' ? theme.expense : theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                    {webPush === null ? 'Checking…'
                      : webPush === 'needs-install' ? 'On iPhone, add Align to your Home Screen first: tap Share, then Add to Home Screen. Open Align from the new icon, then come back here.'
                      : webPush === 'denied' ? 'Notifications are blocked for Align. Turn them on in your phone’s Settings → Notifications → Align, then come back here.'
                      : webPush === 'not-configured' ? 'Push isn’t set up on the server yet. Notifications aren’t switched on for this app yet.'
                      : 'This browser can’t show push notifications.'}
                  </Text>
                </View>
              )}
              {webPush === 'on' && (
                <Pressable accessibilityRole="button" disabled={webBusy} onPress={() => void handleTestWebPush()} style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                  <Text style={[styles.rowText, { color: theme.accent, fontWeight: '700' }]}>Send a test notification</Text>
                </Pressable>
              )}
            </View>
            <Text style={[styles.footerText, { color: theme.textSecondary }]}>
              {webNote || 'Card dues (for cards with reminders on) and today’s tasks, every morning after 8:30. Works on iPhone 16.4+ once Align is on your Home Screen.'}
            </Text>
          </View>
        )}

        {Platform.OS !== 'web' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ALERTS</Text>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: theme.text }]}>Enable Local Reminders</Text>
              <Switch value={pushEnabled} onValueChange={handleTogglePush} trackColor={{ false: theme.backgroundMuted, true: theme.accentFill }} ios_backgroundColor={theme.backgroundMuted} />
            </View>
          </View>
        </View>

        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>DAILY SUMMARY</Text>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
              <Text style={[styles.rowText, { color: theme.text }]}>Daily Agenda Summary</Text>
              <Switch value={dailySummaryEnabled} onValueChange={handleToggleDailySummary} trackColor={{ false: theme.backgroundMuted, true: theme.accentFill }} ios_backgroundColor={theme.backgroundMuted} />
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
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: theme.text }]}>Auto-push Tasks</Text>
              <Switch value={autoPushEnabled} onValueChange={handleToggleAutoPush} trackColor={{ false: theme.backgroundMuted, true: theme.accentFill }} ios_backgroundColor={theme.backgroundMuted} />
            </View>
          </View>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Undone tasks from earlier days move to today, as soon as the day changes.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  // Same column as the other settings pages: centred, at most 720 wide, 16 from the edges
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 16, marginBottom: 7 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 50, paddingHorizontal: 14, paddingVertical: 10 },
  rowText: { fontSize: 16, fontWeight: '500', flex: 1 },
  footerText: { fontSize: 13, marginHorizontal: 16, marginTop: 7, lineHeight: 18 },
});
