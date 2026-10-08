import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Check, Plus, Undo2, Wallet, ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { Skeleton } from '@/components/ui/skeleton';
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadow } from '@/constants/theme';
import { addDays, formatDateKey, startOfWeek, timeToMinutes, todayKey } from '@/lib/dates';
import { usePhone } from '@/lib/phone-context';
import { isTaskForDate, itemTime, type PlannerItem } from '@/lib/planner-item';
import { usePlannerItems } from '@/lib/use-planner-items';
import ItemModal from '@/components/ItemModal';
import TaskCard from '@/components/TaskCard';
import ScreenHeader, { HeaderButton } from '@/components/ScreenHeader';
import SwipeAction from '@/components/SwipeAction';
import { triggerHaptic } from '@/lib/haptics';

const FILTERS = ['All', 'Open', 'Completed'] as const;
type Filter = typeof FILTERS[number];

export default function DailyScreen() {
  const theme = useTheme();
  const c = theme;
  const { phone } = usePhone();
  const { items, loading, error, toggleDone, deleteItem, addItem, refresh } = usePlannerItems(phone);
  const [refreshing, setRefreshing] = useState(false);
  if (refreshing && !loading) setRefreshing(false);
  const [dailyDate, setDailyDate] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>('All');
  const [editingItem, setEditingItem] = useState<PlannerItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  // Last task removed by swipe, kept briefly so it can be restored.
  const [deleted, setDeleted] = useState<PlannerItem | null>(null);

  useEffect(() => {
    if (!deleted) return;
    const t = setTimeout(() => setDeleted(null), 5000);
    return () => clearTimeout(t);
  }, [deleted]);

  const dateKey = formatDateKey(dailyDate);
  const today = todayKey();
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(dailyDate), i)), [dailyDate]);

  const allDayTasks = items.filter(item => isTaskForDate(item, dateKey));
  const dailyFinances = items.filter(item => (item.type === 'expense' || item.type === 'income') && item.date === dateKey);
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

  async function remove(item: PlannerItem) {
    setActionError('');
    // Offer undo right away: the delete is applied locally at once, and the server confirmation can take a
    // long time (or never arrive while offline).
    setDeleted(item);
    try {
      await deleteItem(item.id);
    } catch {
      setDeleted(null);
      setActionError('Could not delete this task. Please try again.');
    }
  }

  async function undoDelete() {
    if (!deleted) return;
    // Re-create it from the removed copy (it gets a new id and owner/created time).
    const copy: Partial<PlannerItem> = { ...deleted };
    delete copy.id;
    delete copy.createdAt;
    delete copy.ownerId;
    setDeleted(null);
    try {
      await addItem(copy as Omit<PlannerItem, 'id' | 'createdAt' | 'ownerId'>);
    } catch {
      setActionError('Could not restore the task.');
    }
  }

  function renderTask(item: PlannerItem, hideTime = false) {
    // Swipe right to complete, left to delete (same as the Calendar tab).
    return (
      <SwipeAction key={item.id} onComplete={() => void complete(item)} onDelete={() => void remove(item)}>
        <TaskCard
          item={item}
          theme={theme}
          today={today}
          hideTime={hideTime}
          isSwipable
          onToggle={() => void complete(item)}
          onPress={() => openEditor(item)}
        />
      </SwipeAction>
    );
  }

  const progress = allDayTasks.length ? completed / allDayTasks.length : 0;

  return (
    <View style={[styles.safe, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={collapseQuickAddOnScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={() => { triggerHaptic('light'); setRefreshing(true); refresh(); }} />}
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
          {/* Day progress (hidden on an empty day; the empty state says it) */}
          {(loading || allDayTasks.length > 0) && <View style={[styles.progressCard, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
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
          </View>}

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
            <View style={[styles.tasksContainer, { marginTop: 12 }]} accessibilityLabel="Loading tasks">
              {[0, 1, 2].map(i => (
                <View key={i} style={[styles.skeletonCard, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                  <Skeleton width={22} height={22} radius={11} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Skeleton width={i === 1 ? '55%' : '75%'} height={14} />
                    <Skeleton width="35%" height={10} />
                  </View>
                </View>
              ))}
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIconBox, { backgroundColor: c.accentSoft }]}>
                <Check size={22} color={c.accent} strokeWidth={2.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.text }]}>
                {filter === 'Completed' ? 'No completed tasks' : allDayTasks.length ? 'No tasks in this filter' : 'All clear for today'}
              </Text>
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                {allDayTasks.length ? 'Switch to All to see everything planned.' : 'Type in the bar below to plan something.'}
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

                {/* Finances Section */}
                {dailyFinances.length > 0 && (
                  <>
                    <View style={{ marginTop: 24, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Wallet color={c.textTertiary} size={16} />
                      <Text style={[styles.sectionHeader, { color: c.textTertiary, marginTop: 0 }]}>Finances</Text>
                    </View>
                    {dailyFinances.map(item => {
                      const isIncome = item.type === 'income';
                      return (
                        <View key={item.id} style={[{ backgroundColor: c.backgroundElement, borderColor: c.border, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1 }]}>
                          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isIncome ? c.incomeSoft : c.expenseSoft, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                            {isIncome ? <ArrowUpRight color={c.income} size={20} /> : <ArrowDownRight color={c.expense} size={20} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>{item.title}</Text>
                            <Text style={{ color: c.textTertiary, fontSize: 12, marginTop: 2 }}>{item.category || 'Other'}</Text>
                          </View>
                          <Text style={{ color: isIncome ? c.income : c.text, fontWeight: '700', fontSize: 16 }}>
                            {isIncome ? '+' : '-'}₹{item.amount || 0}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}

            </View>
          )}
        </View>
      </ScrollView>

      {deleted && (
        <View style={[styles.undoBar, { backgroundColor: c.text }, Shadow.raised]} accessibilityLiveRegion="polite">
          <Text style={{ color: c.background, flex: 1, fontWeight: '600' }} numberOfLines={1}>Deleted “{deleted.title}”</Text>
          <Pressable accessibilityRole="button" onPress={() => void undoDelete()} hitSlop={8} style={styles.undoBtn}>
            <Undo2 color={c.background} size={16} />
            <Text style={{ color: c.background, fontWeight: '800' }}>Undo</Text>
          </Pressable>
        </View>
      )}

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
  // Floats above the quick-add bar and tab bar.
  undoBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
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
    paddingVertical: 48,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: Radius.lg,
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
