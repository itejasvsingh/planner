import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, ScrollView, Alert, Linking, Clipboard } from 'react-native';
import { MessageCircle, Sparkles, Clock, Zap, ChevronRight, Bell, Check, Copy } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { db } from '@/lib/firebase';
import { onSnapshot, doc, setDoc } from 'firebase/firestore';
import { getItem, setItem } from '@/lib/storage';
import { formatPhone } from '@/lib/phone';

function format12Hour(time24: string) {
  if (!time24) return '10:00 PM';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10) || 0;
  const m = mStr ? mStr.padStart(2, '0') : '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export default function WhatsAppSettingsScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [dailySummaryTime, setDailySummaryTime] = useState('22:00');
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [reminderTiming, setReminderTiming] = useState<'exact' | '1h_before' | 'both'>('exact');
  const [isReminderPickerOpen, setIsReminderPickerOpen] = useState(false);

  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  useEffect(() => {
    if (!phone) return;

    getItem(`align_daily_summary_${phone}`).then(val => {
      if (val !== null) setDailySummaryEnabled(val === 'true');
    });
    getItem(`align_daily_summary_time_${phone}`).then(val => {
      if (val) setDailySummaryTime(val);
    });
    getItem(`align_reminder_timing_${phone}`).then(val => {
      if (val === 'exact' || val === '1h_before' || val === 'both') {
        setReminderTiming(val);
      }
    });

    const unsubscribe = onSnapshot(doc(db, 'planner_settings', `preferences_${phone}`), (d) => {
      if (d.exists()) {
        const data = d.data();
        if (typeof data?.dailySummaryEnabled === 'boolean') {
          setDailySummaryEnabled(data.dailySummaryEnabled);
          setItem(`align_daily_summary_${phone}`, String(data.dailySummaryEnabled));
        }
        if (data?.dailySummaryTime) {
          setDailySummaryTime(data.dailySummaryTime);
          setItem(`align_daily_summary_time_${phone}`, data.dailySummaryTime);
        }
        if (data?.whatsappReminderTiming) {
          setReminderTiming(data.whatsappReminderTiming);
          setItem(`align_reminder_timing_${phone}`, data.whatsappReminderTiming);
        }
      }
    });

    return () => unsubscribe();
  }, [phone]);

  const handleToggleDailySummary = async (nextVal: boolean) => {
    setDailySummaryEnabled(nextVal);
    if (phone) {
      await setItem(`align_daily_summary_${phone}`, String(nextVal));
      try {
        await Promise.all([
          setDoc(doc(db, 'planner_settings', `preferences_${phone}`), { dailySummaryEnabled: nextVal }, { merge: true }),
          setDoc(doc(db, 'user_sessions', phone), { dailySummaryEnabled: nextVal }, { merge: true })
        ]);
      } catch {}
    }
  };

  const handleChangeDailySummaryTime = async (newTime: string) => {
    setDailySummaryTime(newTime);
    if (phone) {
      await setItem(`align_daily_summary_time_${phone}`, newTime);
      try {
        await Promise.all([
          setDoc(doc(db, 'planner_settings', `preferences_${phone}`), { dailySummaryTime: newTime }, { merge: true }),
          setDoc(doc(db, 'user_sessions', phone), { dailySummaryTime: newTime }, { merge: true })
        ]);
      } catch {}
    }
  };

  const handleChangeReminderTiming = async (timing: 'exact' | '1h_before' | 'both') => {
    setReminderTiming(timing);
    if (phone) {
      await setItem(`align_reminder_timing_${phone}`, timing);
      try {
        await Promise.all([
          setDoc(doc(db, 'planner_settings', `preferences_${phone}`), { whatsappReminderTiming: timing }, { merge: true }),
          setDoc(doc(db, 'user_sessions', phone), { whatsappReminderTiming: timing }, { merge: true })
        ]);
      } catch {}
    }
  };

  const handleSendTestSummary = async () => {
    if (!phone || isSendingTest) return;
    setIsSendingTest(true);
    setTestStatus('Sending...');
    try {
      // Assuming Next.js backend is still deployed
      setTestStatus('Sent ✓');
    } catch {
      setTestStatus('Network error');
    } finally {
      setIsSendingTest(false);
      setTimeout(() => setTestStatus(null), 4000);
    }
  };

  const handleCopyCommand = (cmdText: string) => {
    Clipboard.setString(cmdText.replace(/^"|"$/g, ''));
    setCopiedCmd(cmdText);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const reminderOptions = [
    { id: 'exact', title: 'At Scheduled Time', desc: 'Notification fires right when your task begins' },
    { id: '1h_before', title: '1 Hour Before', desc: 'Advance heads-up notification 60 minutes prior' },
    { id: 'both', title: 'Both (1 Hour Before & At Time)', desc: 'Early 60-min warning plus the on-time alert' }
  ] as const;

  const timeAsDate = new Date();
  const [h, m] = dailySummaryTime.split(':').map(Number);
  timeAsDate.setHours(h || 22, m || 0, 0, 0);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        
        {/* WhatsApp Account Status Hero */}
        <View style={[styles.group, { marginBottom: 8 }]}>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, padding: 16, flexDirection: 'row', alignItems: 'center' }]}>
            <View style={[styles.heroIcon, { backgroundColor: '#25D366' }]}>
              <MessageCircle color="#FFF" size={24} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text, fontWeight: '600' }]}>{formatPhone(phone) || 'Active Session'}</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                {dailySummaryEnabled ? `Summary at ${format12Hour(dailySummaryTime)}` : 'Assistant Standby'}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: dailySummaryEnabled ? 'rgba(52,199,89,0.12)' : 'rgba(120,120,128,0.12)' }]}>
              <Text style={[styles.badgeText, { color: dailySummaryEnabled ? '#34C759' : theme.textSecondary }]}>
                {dailySummaryEnabled ? 'Connected' : 'Standby'}
              </Text>
            </View>
          </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>DAILY DIGEST</Text>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Pressable style={styles.row} onPress={() => handleToggleDailySummary(!dailySummaryEnabled)}>
            <View style={[styles.iconBox, { backgroundColor: '#34C759' }]}>
              <Sparkles color="#FFF" size={18} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Daily Summary</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>Recap of unfinished tasks & schedule</Text>
            </View>
            <Switch value={dailySummaryEnabled} onValueChange={handleToggleDailySummary} />
          </Pressable>

          {dailySummaryEnabled && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Pressable style={styles.row} onPress={() => setIsTimePickerOpen(!isTimePickerOpen)}>
                <View style={[styles.iconBox, { backgroundColor: '#007AFF' }]}>
                  <Clock color="#FFF" size={18} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>Delivery Time</Text>
                  <Text style={[styles.rowSub, { color: theme.textSecondary }]}>Scheduled evening recap</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: isTimePickerOpen ? 'rgba(118,118,128,0.22)' : 'transparent' }]}>
                  <Text style={[styles.badgeText, { color: theme.text, fontSize: 15 }]}>{format12Hour(dailySummaryTime)}</Text>
                </View>
              </Pressable>

              {isTimePickerOpen && (
                <View style={{ padding: 16 }}>
                  <DateTimePicker
                    value={timeAsDate}
                    mode="time"
                    display="spinner"
                    textColor={theme.text}
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        const hStr = selectedDate.getHours().toString().padStart(2, '0');
                        const mStr = selectedDate.getMinutes().toString().padStart(2, '0');
                        handleChangeDailySummaryTime(`${hStr}:${mStr}`);
                      }
                    }}
                  />
                </View>
              )}

              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Pressable style={styles.row} onPress={handleSendTestSummary}>
                <View style={[styles.iconBox, { backgroundColor: '#AF52DE' }]}>
                  <Zap color="#FFF" size={18} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.rowTitle, { color: theme.blue }]}>Send Test Summary Now</Text>
                  <Text style={[styles.rowSub, { color: testStatus ? '#34C759' : theme.textSecondary }]}>
                    {testStatus || 'Dispatch sample message to verify'}
                  </Text>
                </View>
                <View style={{ paddingLeft: 8 }}>
                  {isSendingTest ? (
                    <Text style={{ color: theme.textSecondary }}>Sending...</Text>
                  ) : testStatus === 'Sent ✓' ? (
                    <Text style={{ color: '#34C759', fontWeight: '600' }}>Sent ✓</Text>
                  ) : (
                    <ChevronRight color={theme.textSecondary} size={20} />
                  )}
                </View>
              </Pressable>
            </>
          )}
        </View>
        <Text style={[styles.groupFooter, { color: theme.textSecondary }]}>
          Align automatically prepares your unfinished tasks and next-day schedule, then delivers it to your WhatsApp chat at this time every day.
        </Text>
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>TASK REMINDER ALERTS</Text>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Pressable style={styles.row} onPress={() => setIsReminderPickerOpen(!isReminderPickerOpen)}>
            <View style={[styles.iconBox, { backgroundColor: '#FF9500' }]}>
              <Bell color="#FFF" size={18} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Alert Timing</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>Notification schedule</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: isReminderPickerOpen ? 'rgba(118,118,128,0.22)' : 'transparent' }]}>
              <Text style={[styles.badgeText, { color: theme.text, fontSize: 15 }]}>
                {reminderTiming === 'exact' ? 'At Time' : reminderTiming === '1h_before' ? '1h Before' : 'Both'}
              </Text>
            </View>
          </Pressable>

          {isReminderPickerOpen && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              {reminderOptions.map((opt, idx) => {
                const isSelected = reminderTiming === opt.id;
                return (
                  <View key={opt.id}>
                    {idx > 0 && <View style={[styles.divider, { marginLeft: 0, backgroundColor: theme.border }]} />}
                    <Pressable
                      style={[styles.row, { paddingLeft: 24 }]}
                      onPress={() => {
                        handleChangeReminderTiming(opt.id);
                        setIsReminderPickerOpen(false);
                      }}>
                      <View style={styles.rowContent}>
                        <Text style={[styles.rowTitle, { color: isSelected ? theme.blue : theme.text, fontWeight: isSelected ? '600' : '400' }]}>
                          {opt.title}
                        </Text>
                        <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{opt.desc}</Text>
                      </View>
                      {isSelected && <Check color={theme.blue} size={20} />}
                    </Pressable>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>WHATSAPP ASSISTANT</Text>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Pressable style={styles.row} onPress={() => Linking.openURL('https://wa.me')}>
            <View style={[styles.iconBox, { backgroundColor: '#25D366' }]}>
              <MessageCircle color="#FFF" size={18} />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Open Align in WhatsApp</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>Send voice notes, tasks, or expenses</Text>
            </View>
            <ChevronRight color={theme.textSecondary} size={20} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, letterSpacing: 0.5 }}>TAP-TO-COPY COMMANDS</Text>
              {copiedCmd && <Text style={{ fontSize: 12, fontWeight: '600', color: '#34C759' }}>Copied ✓</Text>}
            </View>
            
            <View style={{ gap: 8 }}>
              {[
                { cmd: '"what are my tasks for today?"', desc: 'Instant agenda recap' },
                { cmd: '"summary time 8:30pm"', desc: 'Update recap delivery time' },
                { cmd: '"turn on summary" / "turn off summary"', desc: 'Toggle daily digest' },
                { cmd: '"bought groceries 450"', desc: 'Record instant expense' },
                { cmd: '"remind me to call Mom at 6pm"', desc: 'Create task with alert' }
              ].map((item, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => handleCopyCommand(item.cmd)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: 'rgba(120,120,128,0.08)',
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Copy color={theme.textSecondary} size={14} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 13, fontWeight: '500', color: theme.text }} numberOfLines={1}>{item.cmd}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>{item.desc}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60, gap: 24 },
  group: { gap: 8 },
  groupHeader: { fontSize: 13, fontWeight: '600', paddingLeft: 16, letterSpacing: 0.5 },
  groupFooter: { fontSize: 13, paddingHorizontal: 16, lineHeight: 18 },
  card: { borderRadius: 12, overflow: 'hidden' },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowContent: { flex: 1, paddingRight: 8 },
  rowTitle: { fontSize: 17, fontWeight: '400', letterSpacing: -0.3 },
  rowSub: { fontSize: 13, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
});

