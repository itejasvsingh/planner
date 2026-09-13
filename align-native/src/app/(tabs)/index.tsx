import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Menu, Plus } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatDateKey, startOfWeek, timeToMinutes, todayKey } from '@/lib/dates';
import { usePhone } from '@/lib/phone-context';
import { isTaskForDate, itemTime, type PlannerItem } from '@/lib/planner-item';
import { usePlannerItems } from '@/lib/use-planner-items';
import DrawerMenuModal from '@/components/DrawerMenuModal';
import ItemModal from '@/components/ItemModal';
import TaskCard from '@/components/TaskCard';

const FILTERS = ['All', 'Open', 'Completed'] as const;
type Filter = typeof FILTERS[number];

export default function DailyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { phone } = usePhone();
  const { items, loading, error, toggleDone } = usePlannerItems(phone);
  const [dailyDate, setDailyDate] = useState(() => new Date());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('All');
  const [editingItem, setEditingItem] = useState<PlannerItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  const dateKey = formatDateKey(dailyDate);
  const today = todayKey();
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(dailyDate), i)), [dailyDate]);

  const allDayTasks = items.filter(item => isTaskForDate(item, dateKey));
  const completed = allDayTasks.filter(item => item.done).length;
  const open = allDayTasks.length - completed;
  const overdue = items.filter(item => item.type === 'task' && !item.done && item.dueDate && item.dueDate < today);

  const filtered = allDayTasks.filter(item => {
    if (filter === 'Open' && item.done) return false;
    if (filter === 'Completed' && !item.done) return false;
    return true;
  });

  const anytime = filtered.filter(item => !itemTime(item)).sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high'));
  const scheduled = filtered.filter(item => itemTime(item)).sort((a, b) => (timeToMinutes(itemTime(a)) ?? 0) - (timeToMinutes(itemTime(b)) ?? 0));

  function openEditor(item: PlannerItem | null = null) {
    setEditingItem(item);
    setModalOpen(true);
  }

  async function complete(item: PlannerItem) {
    setActionError('');
    try {
      await toggleDone(item.id, !!item.done);
    } catch {
      setActionError('Could not update this task. Please try again.');
    }
  }

  function renderTask(item: PlannerItem) {
    return (
      <TaskCard
        key={item.id}
        item={item}
        theme={theme}
        today={today}
        onToggle={() => void complete(item)}
        onPress={() => openEditor(item)}
      />
    );
  }

  // Safe area top padding for Chrome iOS Web App & Dynamic Island
  const topPadding = Platform.OS === 'web'
    ? ('calc(env(safe-area-inset-top, 24px) + 14px)' as any)
    : Math.max(insets.top, 24) + 14;

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* 1. Header Bar: Menu on LEFT, Brand center, Add Task on RIGHT */}
      <View style={[styles.topBar, { paddingTop: topPadding }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          onPress={() => setIsDrawerOpen(true)}
          hitSlop={15}
          style={[styles.iconButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <Menu color={theme.text} size={22} />
        </Pressable>

        <View style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: theme.blue }]}>
            <Check size={17} color="#fff" strokeWidth={3} />
          </View>
          <Text style={[styles.brandText, { color: theme.text }]}>
            align<Text style={{ color: theme.blue }}>.</Text>
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add task"
          onPress={() => openEditor()}
          hitSlop={15}
          style={[styles.iconButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <Plus color={theme.blue} size={22} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Date Title & Remaining Task Counter */}
        <View style={styles.dateHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dateTitle, { color: theme.text }]}>
              {dateKey === today ? 'Today' : dailyDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Text style={[styles.dateSubtitle, { color: theme.textSecondary }]}>
              {dailyDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={[styles.countBadgeText, { color: theme.blue }]}>
              {loading ? '…' : open === 0 && completed > 0 ? 'All done ✓' : `${open} ${open === 1 ? 'task' : 'tasks'}`}
            </Text>
          </View>
        </View>

        {/* 3. Compact Week Selector */}
        <View style={styles.weekRow}>
          {weekDays.map(day => {
            const key = formatDateKey(day);
            const selected = key === dateKey;
            const isDayToday = key === today;
            const hasTasks = items.some(item => isTaskForDate(item, key) && !item.done);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                accessibilityState={{ selected }}
                onPress={() => setDailyDate(day)}
                style={[
                  styles.weekDay,
                  {
                    backgroundColor: selected ? theme.blue : theme.backgroundElement,
                    borderColor: selected ? theme.blue : theme.border,
                  }
                ]}
              >
                <Text style={[styles.weekLabel, { color: selected ? '#fff' : isDayToday ? theme.blue : theme.textSecondary }]}>
                  {day.toLocaleDateString('en-US', { weekday: 'narrow' })}
                </Text>
                <Text style={[styles.weekNum, { color: selected ? '#fff' : isDayToday ? theme.blue : theme.text }]}>
                  {day.getDate()}
                </Text>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: hasTasks ? (selected ? '#fff' : theme.blue) : 'transparent',
                    marginTop: 2,
                  }}
                />
              </Pressable>
            );
          })}
        </View>

        {/* 4. Overdue Notice (Only when relevant) */}
        {dateKey === today && overdue.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDailyDate(new Date(`${overdue.map(i => i.dueDate!).sort()[0]}T12:00:00`))}
            style={[styles.notice, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}
          >
            <Text style={{ color: theme.text, flex: 1, fontSize: 13, fontWeight: '500' }}>
              {overdue.length} overdue {overdue.length === 1 ? 'task' : 'tasks'}
            </Text>
            <Text style={{ color: theme.blue, fontWeight: '700', fontSize: 13 }}>Review →</Text>
          </Pressable>
        )}

        {/* 5. Minimal Filter Chips */}
        <View style={styles.filterRow}>
          {FILTERS.map(f => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(f)}
                style={[
                  styles.filterChip,
                  active
                    ? { backgroundColor: theme.blue }
                    : { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }
                ]}
              >
                <Text style={[styles.filterChipText, { color: active ? '#fff' : theme.textSecondary }]}>
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!!(error || actionError) && (
          <Text accessibilityRole="alert" style={{ color: theme.red, marginBottom: 12, fontSize: 13 }}>
            {actionError || error}
          </Text>
        )}

        {/* 6. Tasks List (Clean & Direct) */}
        {loading && !items.length ? (
          <ActivityIndicator color={theme.blue} style={{ margin: 32 }} />
        ) : filtered.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border }]}>
            <View style={[styles.emptyIconBox, { backgroundColor: theme.backgroundSelected }]}>
              <Check size={22} color={theme.blue} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {filter === 'Completed' ? 'No completed tasks' : allDayTasks.length ? 'No tasks in this filter' : 'All clear for today'}
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {allDayTasks.length ? 'Switch to All to see everything planned.' : 'Tap + to plan your first task.'}
            </Text>
          </View>
        ) : (
          <View style={styles.tasksContainer}>
            {scheduled.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>SCHEDULED</Text>
                {scheduled.map(item => (
                  <View key={item.id} style={styles.taskItem}>
                    <Text style={[styles.timeLabel, { color: theme.blue }]}>{itemTime(item)}</Text>
                    {renderTask(item)}
                  </View>
                ))}
              </>
            )}

            {anytime.length > 0 && (
              <>
                {scheduled.length > 0 && <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ANYTIME</Text>}
                {anytime.map(renderTask)}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <DrawerMenuModal visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      <ItemModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        initialItem={editingItem}
        defaultDate={dateKey}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 14,
  },
  dateTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dateSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 3,
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  weekNum: {
    fontSize: 16,
    fontWeight: '700',
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tasksContainer: {
    gap: 2,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 6,
  },
  taskItem: {
    marginBottom: 2,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
    marginLeft: 4,
  },
  empty: {
    alignItems: 'center',
    padding: 32,
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    marginTop: 10,
  },
  emptyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
