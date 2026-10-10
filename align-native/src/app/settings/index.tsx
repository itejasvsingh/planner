import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { doc, onSnapshot, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { TextInput, Modal, KeyboardAvoidingView } from 'react-native';
import { Bell, BellRing, ChevronRight, FileUp, LogOut, Mail, MessageCircle, MessageSquareText, Moon, Send, Repeat, Shield, Smartphone, Sun } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { useThemeMode } from '@/lib/theme-context';
import { tintColors, type TintKey } from '@/lib/categories';
import { usePhone } from '@/lib/phone-context';
import { triggerHaptic } from '@/lib/haptics';
import { db } from '@/lib/firebase';
import { isSecurityEnabled } from '@/lib/auth';
import { signInWithGoogle } from '@/lib/google-auth';
import { Radius } from '@/constants/theme';

function format12Hour(timeStr: string) {
  if (!timeStr) return '';
  const [hStr, mStr = '00'] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${mStr.padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

type Theme = ReturnType<typeof useTheme>;

/** Flat group of rows matching the design. */
function Group({ title, footer, children, c }: { title?: string; footer?: string; children: ReactNode; c: Theme }) {
  return (
    <View style={styles.groupWrap}>
      {!!title && <Text style={[styles.groupTitle, { color: c.textTertiary, marginLeft: 20 }]}>{title}</Text>}
      <View style={[styles.group, { backgroundColor: c.background }]}>{children}</View>
      {!!footer && <Text style={[styles.groupFooter, { color: c.textTertiary, marginLeft: 20 }]}>{footer}</Text>}
    </View>
  );
}

/** One settings row: colored icon tile, label (+ optional subtitle), trailing value/switch/chevron. */
function Row({
  c, icon, tint = 'gray', label, subtitle, value, onPress, trailing, last, destructive,
}: {
  c: Theme;
  icon: ReactNode;
  /** Soft colored tile behind the icon. */
  tint?: TintKey;
  label: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  last?: boolean;
  destructive?: boolean;
}) {
  const content = (pressed: boolean) => (
    <View style={[styles.row, pressed && { backgroundColor: c.backgroundMuted }]}>
      <View style={{ marginLeft: 20, marginRight: 16 }}>{icon}</View>
      <View style={[styles.rowBody, !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: destructive ? c.red : c.text }]} numberOfLines={1}>{label}</Text>
          {!!subtitle && <Text style={[styles.rowSubtitle, { color: c.textSecondary }]} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {!!value && <Text style={[styles.rowValue, { color: c.textSecondary }]}>{value}</Text>}
        {trailing ?? (onPress && !destructive ? <ChevronRight color={c.textTertiary} size={18} /> : null)}
      </View>
    </View>
  );
  if (!onPress) return content(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { triggerHaptic('light'); onPress(); }}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phone, firebaseUser, logout } = usePhone();
  const { mode: themeMode, scheme, setMode } = useThemeMode();

  const [pushEnabled, setPushEnabled] = useState(false);
  const [autoPushEnabled, setAutoPushEnabled] = useState(false);
  const [securityActive, setSecurityActive] = useState(false);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [dailySummaryTime, setDailySummaryTime] = useState('22:00');
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);


  const handleSendFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSendingFeedback(true);
    try {
        const feedbackRef = doc(collection(db, 'feedback'));
        await setDoc(feedbackRef, {
            text: feedbackText,
            userId: phone || 'anonymous',
            createdAt: serverTimestamp(),
            platform: Platform.OS
        });
        setFeedbackText('');
        setFeedbackVisible(false);
        Alert.alert('Thank you!', 'Your feedback has been sent directly to the developer.');
    } catch (e) {
        Alert.alert('Error', 'Could not send feedback. Try again later.');
    }
    setSendingFeedback(false);
  };

  // Re-read device state each time the screen is shown (e.g. coming back from Security)
  useFocusEffect(useCallback(() => {
    isSecurityEnabled().then(setSecurityActive);
    if (Platform.OS !== 'web') {
      Notifications.getPermissionsAsync()
        .then(({ status }) => setPushEnabled(status === 'granted'))
        .catch(() => setPushEnabled(false));
    }
  }, []));

  useEffect(() => {
    if (!phone) return;
    return onSnapshot(
      doc(db, 'planner_settings', `preferences_${phone}`),
      (d) => {
        const data = d.data();
        if (!data) return;
        if (typeof data.autoPushEnabled === 'boolean') setAutoPushEnabled(data.autoPushEnabled);
        if (typeof data.dailySummaryEnabled === 'boolean') setDailySummaryEnabled(data.dailySummaryEnabled);
        if (data.dailySummaryTime) setDailySummaryTime(data.dailySummaryTime);
      },
      (err) => console.warn('Settings preferences notice:', err),
    );
  }, [phone]);

  const togglePush = async () => {
    triggerHaptic('light');
    if (pushEnabled) {
      Alert.alert('Settings', 'Please disable notifications in your phone settings.');
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    setPushEnabled(status === 'granted');
    if (status !== 'granted') Alert.alert('Permission required', 'Please enable notifications in your phone settings.');
  };

  const toggleAutoPush = async (next: boolean) => {
    triggerHaptic('light');
    setAutoPushEnabled(next);
    if (!phone) return;
    try {
      await Promise.all([
        setDoc(doc(db, 'planner_settings', `preferences_${phone}`), { autoPushEnabled: next }, { merge: true }),
        setDoc(doc(db, 'user_sessions', phone), { autoPushEnabled: next }, { merge: true }),
      ]);
    } catch (e) {
      console.warn('Error saving autoPush:', e);
      setAutoPushEnabled(!next);
    }
  };

  const cycleTheme = () => setMode(themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system');

  const signIn = async () => {
    try {
      const u = await signInWithGoogle();
      if (u) triggerHaptic('success');
    } catch (e: any) {
      Alert.alert('Sign In Notice', e.message || 'Could not complete Google Sign-In');
    }
  };

  const signOut = () => {
    logout();
    router.replace('/login');
  };

  const maskedPhone = phone ? (phone.length > 10 ? `+${phone.slice(0, phone.length - 10)} ` : '') + `******${phone.slice(-4)}` : '';
  const name = firebaseUser?.displayName || firebaseUser?.email || maskedPhone || 'Personal Workspace';
  const accountLine = firebaseUser?.email && maskedPhone ? maskedPhone : firebaseUser ? 'Google Account' : maskedPhone ? 'WhatsApp synced' : 'Guest';
  const initial = (firebaseUser?.displayName || firebaseUser?.email || '').trim().charAt(0).toUpperCase();
  const switchTrack = { false: c.backgroundMuted, true: c.income };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
    >
      <Group c={c} title="Account">
        <Row c={c} icon={<Smartphone color={c.textSecondary} size={20} />} label={name} subtitle={accountLine} onPress={() => {}} />
      </Group>

      <Group c={c} title="Preferences">
        {Platform.OS !== 'web' && (
          <Row c={c} tint="red" icon={<BellRing color={tintColors('red', c.isDark).fg} size={17} />} label="Local Reminders"
            trailing={<Switch value={pushEnabled} onValueChange={togglePush} trackColor={switchTrack} ios_backgroundColor={c.backgroundMuted} />} />
        )}
        <Row c={c} tint="orange" icon={<Bell color={tintColors('orange', c.isDark).fg} size={17} />} label="Notifications" onPress={() => router.push('/settings/notifications')} />
        <Row c={c} tint="green" icon={<Repeat color={tintColors('green', c.isDark).fg} size={17} />} label="Auto-Push Rollover" subtitle="Move unfinished tasks to tomorrow"
          trailing={<Switch value={autoPushEnabled} onValueChange={toggleAutoPush} trackColor={switchTrack} ios_backgroundColor={c.backgroundMuted} />} />
        <Row c={c} tint="violet" icon={scheme === 'dark' ? <Moon color={tintColors('violet', c.isDark).fg} size={17} /> : <Sun color={tintColors('violet', c.isDark).fg} size={17} />}
          label="Appearance" value={themeMode.charAt(0).toUpperCase() + themeMode.slice(1)} onPress={cycleTheme} last />
      </Group>

      <Group c={c} title="Assistant">
        <Row c={c} tint="green" icon={<MessageCircle color={tintColors('green', c.isDark).fg} size={17} />} label="WhatsApp"
          subtitle={dailySummaryEnabled ? `Daily summary at ${format12Hour(dailySummaryTime)}` : 'Daily summary, reminders & bot'}
          onPress={() => router.push('/settings/whatsapp')} />
        <Row c={c} tint="blue" icon={<MessageSquareText color={tintColors('blue', c.isDark).fg} size={17} />} label="SMS Auto-Import"
          subtitle="Add expenses from bank messages" onPress={() => router.push('/settings/sms')} />
        <Row c={c} tint="orange" icon={<Mail color={tintColors('orange', c.isDark).fg} size={17} />} label="Gmail"
          subtitle="Add bank alerts from your email automatically" onPress={() => router.push('/settings/gmail')} />
        <Row c={c} tint="teal" icon={<FileUp color={tintColors('teal', c.isDark).fg} size={17} />} label="Import Statement"
          subtitle="Add transactions from a bank or card statement" onPress={() => router.push('/settings/import')} last />
      </Group>

      <Group c={c} title="Privacy">
        <Row c={c} tint="gray" icon={<Shield color={tintColors('gray', c.isDark).fg} size={17} />} label="App Lock" value={securityActive ? 'On' : 'Off'}
          onPress={() => router.push('/settings/security')} last />
      </Group>

      <Group c={c}>
        <Row c={c} tint="red" icon={<LogOut color={c.red} size={17} />} label={phone || firebaseUser ? 'Log Out' : 'Sign In'}
          onPress={signOut} destructive last />
      </Group>

      {/* Feedback Modal */}
      <Modal visible={feedbackVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: c.background, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 50 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: c.text }}>Send Feedback</Text>
              <Pressable onPress={() => setFeedbackVisible(false)} style={{ padding: 8, backgroundColor: c.backgroundElement, borderRadius: Radius.pill }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>
            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="What's on your mind? (Bugs, features, etc.)"
              placeholderTextColor={c.textTertiary}
              multiline
              autoFocus
              style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 16, minHeight: 150, textAlignVertical: 'top' }}
            />
            <Pressable 
              onPress={handleSendFeedback} 
              disabled={sendingFeedback || !feedbackText.trim()}
              style={{ marginTop: 24, backgroundColor: feedbackText.trim() ? c.accent : c.border, padding: 16, borderRadius: Radius.md, alignItems: 'center' }}
            >
              <Text style={{ color: feedbackText.trim() ? '#FFF' : c.textTertiary, fontWeight: '700', fontSize: 16 }}>
                {sendingFeedback ? 'Sending...' : 'Send Feedback'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </ScrollView>

  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12 },
  groupWrap: { marginBottom: 24 },
  groupTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 16, marginBottom: 7 },
  groupFooter: { fontSize: 13, marginHorizontal: 16, marginTop: 7 },
  group: { borderRadius: Radius.md + 2, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  iconTile: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingVertical: 10, paddingRight: 14, gap: 8 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  rowValue: { fontSize: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700' },
  profileName: { fontSize: 19, fontWeight: '700', marginBottom: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  googleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  googleG: { fontSize: 16, fontWeight: '800', color: '#4285F4' },
});
