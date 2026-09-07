import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { addDays, formatDateKey, startOfWeek, timeToMinutes, todayKey } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { usePhone } from '@/lib/phone-context';
import { isTaskForDate, itemTime, type PlannerItem } from '@/lib/planner-item';
import { usePlannerItems } from '@/lib/use-planner-items';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function prioLabel(priority?: string) {
  if (priority === 'high') return 'High';
  if (priority === 'medium') return 'Med';
  if (priority === 'low') return 'Low';
  return null;
}

import SwipeAction from '@/components/SwipeAction';

import DrawerMenuModal from '@/components/DrawerMenuModal';
import { Menu } from 'lucide-react-native';

export default function DailyScreen() {
  const theme = useTheme();
  const { phone, logout } = usePhone();
  const { items, toggleDone, deleteItem, addTask } = usePlannerItems(phone);
  const [dailyDate, setDailyDate] = useState(() => new Date());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [hasTime, setHasTime] = useState(false);
  const [draftTime, setDraftTime] = useState('09:00');

  const dateKey = formatDateKey(dailyDate);
  const today = todayKey();
  const weekStart = startOfWeek(dailyDate);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const dayTasks = items.filter((item) => isTaskForDate(item, dateKey) && !item.done);
  const anytimeTasks = dayTasks.filter((item) => !itemTime(item));
  const timedTasks = dayTasks
    .filter((item) => itemTime(item))
    .map((item) => ({ ...item, sortTime: itemTime(item) }))
    .sort((a, b) => (timeToMinutes(a.sortTime) ?? 0) - (timeToMinutes(b.sortTime) ?? 0));

  function confirmLogout() {
    Alert.alert('Log out', `Signed in as ${formatPhone(phone)}. Switch number?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  function onTaskPress(item: PlannerItem) {
    Alert.alert(item.title || 'Task', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: item.done ? 'Mark undone' : 'Complete', onPress: () => void toggleDone(item.id, !!item.done) },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteItem(item.id) },
    ]);
  }

  async function saveTask() {
    const title = draftTitle.trim();
    if (!title) {
      Alert.alert('Align', 'Please enter a title before saving.');
      return;
    }
    await addTask({
      title,
      dueDate: dateKey,
      reminderTime: hasTime && draftTime.trim() ? draftTime.trim() : null,
    });
    setDraftTitle('');
    setHasTime(false);
    setAdding(false);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={[styles.navArrow, { backgroundColor: theme.backgroundElement }]} onPress={() => setDailyDate((d) => addDays(d, -1))}>
          <Text style={[styles.navArrowText, { color: theme.blue }]}>‹</Text>
        </Pressable>
        <Pressable onLongPress={confirmLogout} style={styles.navCenter}>
          <Text style={[styles.title, { color: theme.text }]}>Agenda</Text>
          <Text style={[styles.dateSub, { color: theme.textSecondary }]}>
            {dateKey === today
              ? 'TODAY'
              : dailyDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
        </Pressable>
        <Pressable style={[styles.navArrow, { backgroundColor: theme.backgroundElement }]} onPress={() => setDailyDate((d) => addDays(d, 1))}>
          <Text style={[styles.navArrowText, { color: theme.blue }]}>›</Text>
        </Pressable>
      </View>
      <View style={{ position: 'absolute', top: 12, right: 16 }}>
        <Pressable onPress={() => setIsDrawerOpen(true)} style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.7 : 1 }]}>
          <Menu color={theme.text} size={28} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {weekDays.map((day, i) => {
          const key = formatDateKey(day);
          const selected = key === dateKey;
          return (
            <Pressable
              key={key}
              onPress={() => setDailyDate(day)}
              style={[
                styles.weekDay,
                selected && { backgroundColor: theme.blue },
              ]}>
              <Text style={[styles.weekLabel, { color: selected ? '#fff' : theme.textSecondary }]}>{DAY_LABELS[i]}</Text>
              <Text style={[styles.weekNum, { color: selected ? '#fff' : theme.text }]}>{day.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {anytimeTasks.length === 0 && timedTasks.length === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Schedule is clear</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 15 }}>Add a task or event to get started.</Text>
            <Pressable style={[styles.addPill, { backgroundColor: theme.blue }]} onPress={() => setAdding(true)}>
              <Text style={styles.addPillText}>+ Add Task</Text>
            </Pressable>
          </View>
        )}

        {anytimeTasks.map((item) => (
          <SwipeAction 
            key={item.id}
            onComplete={() => void toggleDone(item.id, !!item.done)}
            onDelete={() => void deleteItem(item.id)}
          >
            <TaskCard
              item={item}
              theme={theme}
              today={today}
              onToggle={() => void toggleDone(item.id, !!item.done)}
              onPress={() => onTaskPress(item)}
              isSwipable
            />
          </SwipeAction>
        ))}

        {timedTasks.length > 0 && (
          <View style={styles.timeline}>
            <Text style={[styles.timelineHeader, { color: theme.textSecondary }]}>Live Timeline</Text>
            {timedTasks.map((item) => (
              <View key={item.id} style={styles.timelineRow}>
                <Text style={[styles.timeLabel, { color: theme.blue }]}>{itemTime(item)}</Text>
                <View style={{ flex: 1 }}>
                  <SwipeAction 
                    onComplete={() => void toggleDone(item.id, !!item.done)}
                    onDelete={() => void deleteItem(item.id)}
                  >
                    <TaskCard
                      item={item}
                      theme={theme}
                      today={today}
                      compact
                      onToggle={() => void toggleDone(item.id, !!item.done)}
                      onPress={() => onTaskPress(item)}
                      isSwipable
                    />
                  </SwipeAction>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      
      <DrawerMenuModal visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </SafeAreaView>
  );
}

function TaskCard({
  item,
  theme,
  today,
  compact,
  onToggle,
  onPress,
  isSwipable,
}: {
  item: PlannerItem;
  theme: ReturnType<typeof useTheme>;
  today: string;
  compact?: boolean;
  onToggle: () => void;
  onPress: () => void;
  isSwipable?: boolean;
}) {
  const overdue = (item.dueDate || '') < today;
  const prio = prioLabel(item.priority);
  const subsTotal = item.subtasks?.length || 0;
  const subsDone = item.subtasks?.filter((s) => s.done).length || 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.backgroundElement, flex: compact ? 1 : undefined, marginBottom: isSwipable ? 0 : 10 }]}>
      <Pressable onPress={onToggle} hitSlop={8} style={[styles.check, { borderColor: theme.border }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, { color: theme.text }]}>{item.title}</Text>
        <View style={styles.metaRow}>
          {prio ? (
            <Text style={[styles.pill, { color: theme.blue, backgroundColor: theme.background }]}>{prio}</Text>
          ) : null}
          {subsTotal > 0 ? (
            <Text style={[styles.pill, { color: theme.text, backgroundColor: theme.background }]}>
              {subsDone}/{subsTotal}
            </Text>
          ) : null}
          {overdue ? (
            <Text style={[styles.pill, { color: theme.red, backgroundColor: theme.background }]}>Overdue</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowText: { fontSize: 22, fontWeight: '700' },
  navCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  dateSub: { fontSize: 14, fontWeight: '600', letterSpacing: 0.5, marginTop: 4 },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  weekLabel: { fontSize: 11, fontWeight: '700' },
  weekNum: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontWeight: '700', fontSize: 18 },
  addPill: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 100 },
  addPillText: { color: '#fff', fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, marginTop: 2 },
  taskTitle: { fontSize: 17, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  timeline: { marginTop: 8 },
  timelineHeader: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  timeLabel: { width: 56, fontSize: 12, fontWeight: '700', marginTop: 18 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '400', marginTop: -2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 12,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
});
