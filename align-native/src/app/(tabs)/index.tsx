import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Menu, Plus } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { Colors, Radius, Shadow, Type } from '@/constants/theme';
import { addDays, formatDateKey, startOfWeek, timeToMinutes, todayKey } from '@/lib/dates';
import { usePhone } from '@/lib/phone-context';
import { isTaskForDate, itemTime, type PlannerItem } from '@/lib/planner-item';
import { usePlannerItems } from '@/lib/use-planner-items';
import DrawerMenuModal from '@/components/DrawerMenuModal';
import ItemModal from '@/components/ItemModal';
import TaskCard from '@/components/TaskCard';
import { triggerHaptic } from '@/lib/haptics';

const FILTERS = ['All', 'Open', 'Completed'] as const;
type Filter = typeof FILTERS[number];

export default function DailyScreen() {
  const theme = useTheme();
  const c = theme.isDark ? Colors.dark : Colors.light;
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

  // Safe area top padding for Dynamic Island / Chrome iOS Web App
  const topPadding = Platform.OS === 'web'
    ? 64
    : Math.max(insets.top, 52);

  return (
    <View style={[styles.safe, { backgroundColor: c.background }]}>
      {/* 1. iOS Top Navigation Bar: Menu on Left, Brand in Center, Add on Right */}
      <View style={[styles.topBar, { paddingTop: topPadding }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          onPress={() => {
            triggerHaptic('light');
            setIsDrawerOpen(true);
          }}
          hitSlop={15}
          style={[styles.iconButton, { backgroundColor: c.backgroundElement, borderColor: c.border }]}
        >
          <Menu color={c.text} size={20} />
        </Pressable>

        <View style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: c.accent }]}>
            <Check size={14} color="#fff" strokeWidth={3} />
          </View>
          <Text style={[styles.brandText, { color: c.text }]}>
            align<Text style={{ color: c.accent }}>.</Text>
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add task"
          onPress={() => {
            triggerHaptic('light');
            openEditor();
          }}
          hitSlop={15}
          style={[styles.iconButton, { backgroundColor: c.backgroundElement, borderColor: c.border }]}
        >
          <Plus color={c.accent} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Apple iOS Large Title Row */}
        <View style={styles.dateHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dateTitle, { color: c.text }]}>
              {dateKey === today ? 'Today' : dailyDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Text style={[styles.dateSubtitle, { color: c.textSecondary }]}>
              {dailyDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          <View style={[styles.countBadge, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={[styles.countBadgeText, { color: c.accent }]}>
              {loading ? '…' : open === 0 && completed > 0 ? 'All done ✓' : `${open} remaining`}
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
                onPress={() => {
                  triggerHaptic('selection');
                  setDailyDate(day);
                }}
                style={[
                  styles.weekDay,
                  {
                    backgroundColor: selected ? c.accent : c.backgroundElement,
                    borderColor: selected ? c.accent : c.border,
                  }
                ]}
              >
                <Text style={[styles.weekLabel, { color: selected ? '#fff' : isDayToday ? c.accent : c.textSecondary }]}>
                  {day.toLocaleDateString('en-US', { weekday: 'narrow' })}
                </Text>
                <Text style={[styles.weekNum, { color: selected ? '#fff' : isDayToday ? c.accent : c.text }]}>
                  {day.getDate()}
                </Text>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: hasTasks ? (selected ? '#fff' : c.accent) : 'transparent',
                    marginTop: 3,
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
            onPress={() => {
              triggerHaptic('light');
              setDailyDate(new Date(`${overdue.map(i => i.dueDate!).sort()[0]}T12:00:00`));
            }}
            style={[styles.notice, { backgroundColor: c.backgroundSelected, borderColor: c.border }]}
          >
            <Text style={{ color: c.text, flex: 1, fontSize: 13, fontWeight: '500' }}>
              {overdue.length} overdue {overdue.length === 1 ? 'task' : 'tasks'}
            </Text>
            <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>Review →</Text>
          </Pressable>
        )}

        {/* 5. iOS Native Segmented Control */}
        <View style={[styles.segmentedControl, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          {FILTERS.map(f => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  triggerHaptic('selection');
                  setFilter(f);
                }}
                style={[
                  styles.segment,
                  active && [styles.segmentActive, { backgroundColor: c.backgroundSelected, borderColor: c.border }]
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: active ? c.accent : c.textSecondary,
                      fontWeight: active ? '700' : '500',
                    }
                  ]}
                >
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!!(error || actionError) && (
          <Text accessibilityRole="alert" style={{ color: c.expense, marginBottom: 12, fontSize: 13 }}>
            {actionError || error}
          </Text>
        )}

        {/* 6. Tasks List (Clean & Direct) */}
        {loading && !items.length ? (
          <ActivityIndicator color={c.accent} style={{ margin: 32 }} />
        ) : filtered.length === 0 ? (
          <View style={[styles.empty, { borderColor: c.border }]}>
            <View style={[styles.emptyIconBox, { backgroundColor: c.backgroundSelected }]}>
              <Check size={22} color={c.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              {filter === 'Completed' ? 'No completed tasks' : allDayTasks.length ? 'No tasks in this filter' : 'All clear for today'}
            </Text>
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>
              {allDayTasks.length ? 'Switch to All to see everything planned.' : 'Tap + to plan your first task.'}
            </Text>
          </View>
        ) : (
          <View style={styles.tasksContainer}>
            {scheduled.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: c.textSecondary }]}>SCHEDULED</Text>
                {scheduled.map(item => (
                  <View key={item.id} style={styles.taskItem}>
                    <Text style={[styles.timeLabel, { color: c.accent }]}>{itemTime(item)}</Text>
                    {renderTask(item)}
                  </View>
                ))}
              </>
            )}

            {anytime.length > 0 && (
              <>
                {scheduled.length > 0 && <Text style={[styles.sectionHeader, { color: c.textSecondary }]}>ANYTIME</Text>}
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
    paddingBottom: 8,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandMark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 130,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  dateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 14,
  },
  dateTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dateSubtitle: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  countBadge: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'center',
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
    paddingVertical: 8,
    borderRadius: 12,
    gap: 2,
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  weekNum: {
    fontSize: 15,
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
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentActive: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
  },
  tasksContainer: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  taskItem: {
    gap: 4,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 2,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    marginTop: 12,
  },
  emptyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
