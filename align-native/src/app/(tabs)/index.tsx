import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Check, Plus } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { Fonts, Radius, Shadow } from '@/constants/theme';
import { addDays, formatDateKey, startOfWeek, timeToMinutes, todayKey } from '@/lib/dates';
import { usePhone } from '@/lib/phone-context';
import { isTaskForDate, itemTime, type PlannerItem } from '@/lib/planner-item';
import { usePlannerItems } from '@/lib/use-planner-items';
import ItemModal from '@/components/ItemModal';
import TaskCard from '@/components/TaskCard';
import ScreenHeader, { HeaderButton } from '@/components/ScreenHeader';
import { triggerHaptic } from '@/lib/haptics';

const FILTERS = ['All', 'Open', 'Completed'] as const;
type Filter = typeof FILTERS[number];

export default function DailyScreen() {
  const theme = useTheme();
  const c = theme;
  const { phone } = usePhone();
  const { items, loading, error, toggleDone } = usePlannerItems(phone);
  const [dailyDate, setDailyDate] = useState(() => new Date());
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

  function renderTask(item: PlannerItem, hideTime = false) {
    return (
      <TaskCard
        key={item.id}
        item={item}
        theme={theme}
        today={today}
        hideTime={hideTime}
        onToggle={() => void complete(item)}
        onPress={() => openEditor(item)}
      />
    );
  }

  const progress = allDayTasks.length ? completed / allDayTasks.length : 0;

  return (
    <View style={[styles.safe, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title={dateKey === today ? 'Today' : dailyDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          subtitle={dailyDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          actions={
            <HeaderButton label="Add task" onPress={() => openEditor()} filled>
              <Plus color={c.onAccent} size={20} strokeWidth={2.5} />
            </HeaderButton>
          }
        />

        <View style={styles.content}>
          {/* Day progress */}
          <View style={[styles.progressCard, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
            <View style={styles.progressText}>
              <Text style={[styles.progressValue, { color: c.text }]}>
                {loading ? '…' : open === 0 && completed > 0 ? 'All done' : `${open} to go`}
              </Text>
              <Text style={[styles.progressLabel, { color: c.textSecondary }]}>
                {completed} of {allDayTasks.length} complete
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: c.backgroundMuted }]}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: c.accentFill }]} />
            </View>
          </View>

          {/* Week strip */}
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
                    triggerHaptic('light');
                    setDailyDate(day);
                  }}
                  style={[styles.weekDay, selected && { backgroundColor: c.accentFill }]}
                >
                  <Text style={[styles.weekLabel, { color: selected ? c.onAccent : c.textTertiary }]}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                  </Text>
                  <Text style={[styles.weekNum, { color: selected ? c.onAccent : isDayToday ? c.accent : c.text }]}>
                    {day.getDate()}
                  </Text>
                  <View
                    style={[
                      styles.weekDot,
                      { backgroundColor: hasTasks ? (selected ? c.onAccent : c.textTertiary) : 'transparent' },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          {/* Overdue notice (only when relevant) */}
          {dateKey === today && overdue.length > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                triggerHaptic('light');
                setDailyDate(new Date(`${overdue.map(i => i.dueDate!).sort()[0]}T12:00:00`));
              }}
              style={[styles.notice, { backgroundColor: c.warningSoft }]}
            >
              <View style={[styles.noticeDot, { backgroundColor: c.warning }]} />
              <Text style={{ color: c.text, flex: 1, fontSize: 13, fontWeight: '600' }}>
                {overdue.length} overdue {overdue.length === 1 ? 'task' : 'tasks'}
              </Text>
              <Text style={{ color: c.warning, fontWeight: '700', fontSize: 13 }}>Review</Text>
            </Pressable>
          )}

          {/* Filter */}
          <View style={[styles.segmentedControl, { backgroundColor: c.backgroundMuted }]}>
            {FILTERS.map(f => {
              const active = filter === f;
              return (
                <Pressable
                  key={f}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    triggerHaptic('light');
                    setFilter(f);
                  }}
                  style={[styles.segment, active && { backgroundColor: c.backgroundElement, borderColor: c.border }]}
                >
                  <Text style={[styles.segmentText, { color: active ? c.text : c.textSecondary, fontWeight: active ? '700' : '500' }]}>
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

          {/* Tasks */}
          {loading && !items.length ? (
            <ActivityIndicator color={c.accent} style={{ margin: 32 }} />
          ) : filtered.length === 0 ? (
            <View style={[styles.empty, { borderColor: c.border }]}>
              <View style={[styles.emptyIconBox, { backgroundColor: c.accentFill }]}>
                <Check size={22} color={c.onAccent} strokeWidth={2.5} />
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
                  <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>Scheduled</Text>
                  {scheduled.map(item => (
                    <View key={item.id} style={styles.timedRow}>
                      <Text numberOfLines={1} style={[styles.timeLabel, { color: item.done ? c.textTertiary : c.textSecondary }]}>
                        {itemTime(item)?.replace(/^0/, '')}
                      </Text>
                      <View style={{ flex: 1 }}>{renderTask(item, true)}</View>
                    </View>
                  ))}
                </>
              )}

              {anytime.length > 0 && (
                <>
                  <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>Anytime</Text>
                  {anytime.map(item => renderTask(item))}
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>

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
  scroll: {
    paddingBottom: 150,
  },
  content: {
    paddingHorizontal: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  progressCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  progressText: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  progressValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontFamily: Fonts?.rounded,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 14,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: Radius.md,
    gap: 3,
  },
  weekLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  weekNum: {
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  weekDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  notice: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.md,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm + 1,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentText: {
    fontSize: 13,
  },
  tasksContainer: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  timedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeLabel: {
    width: 66,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
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
