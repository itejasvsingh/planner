import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Check, ChevronDown, ChevronUp, Plus, SlidersHorizontal, Undo2 } from 'lucide-react-native';
import { Skeleton } from '@/components/ui/skeleton';
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadow } from '@/constants/theme';
import { addDays, formatDateKey, parseDateKey, timeToMinutes, todayKey } from '@/lib/dates';
import { moveOptions } from '@/lib/reschedule';
import { usePhone } from '@/lib/phone-context';
import { isTaskForDate, itemDateKey, itemTime, type PlannerItem } from '@/lib/planner-item';
import { usePlannerItems } from '@/lib/use-planner-items';
import ItemModal from '@/components/ItemModal';
import MoveSheet from '@/components/MoveSheet';
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
  const { items, loading, error, toggleDone, deleteItem, addItem, refresh, updateItem } = usePlannerItems(phone);
  const [refreshing, setRefreshing] = useState(false);
  if (refreshing && !loading) setRefreshing(false);
  const [dailyDate, setDailyDate] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>('All');
  const [editingItem, setEditingItem] = useState<PlannerItem | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  // The task being moved to another day (press and hold, or the Move buttons under an overdue task)
  const [moving, setMoving] = useState<PlannerItem | null>(null);
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
  // A scrolling strip of days (a month back, two months ahead, wider if you jump further), centred on the chosen day
  const DAY_W = 52;
  const days = useMemo(() => {
    const t = parseDateKey(today);
    const sel = parseDateKey(dateKey);
    const first = addDays(sel < t ? sel : t, -30);
    const last = addDays(sel > t ? sel : t, 60);
    const n = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
    return Array.from({ length: n }, (_, i) => addDays(first, i));
  }, [today, dateKey]);
  const strip = useRef<ScrollView>(null);
  const [measuredW, setStripW] = useState(0);
  // The strip's width: as laid out, else the screen less the page padding (layout events can arrive late)
  const winW = useWindowDimensions().width;
  const stripW = measuredW || Math.min(winW, 720) - 32;
  const selIndex = days.findIndex(d => formatDateKey(d) === dateKey);
  // A day you tap stays where it is; only a change from elsewhere (Today, jumping to an overdue day) centres the strip
  const tappedDay = useRef(false);
  const centreOnSelected = (animated: boolean) => {
    if (!stripW || selIndex < 0) return;
    strip.current?.scrollTo({ x: Math.max(0, selIndex * DAY_W - (stripW - DAY_W) / 2), animated });
  };
  const centredOnce = useRef(false);
  useEffect(() => {
    if (tappedDay.current) { tappedDay.current = false; return; }
    if (!stripW) return;
    // First time: jump there (no animation), and try again as the days finish laying out; later changes glide
    const first = !centredOnce.current;
    centredOnce.current = true;
    centreOnSelected(!first);
    if (!first) return;
    const t1 = setTimeout(() => centreOnSelected(false), 120);
    const t2 = setTimeout(() => centreOnSelected(false), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIndex, stripW]);
  // Days that still have something to do (a dot under the number)
  const busyDays = useMemo(() => new Set(items.filter(i => i.type === 'task' && !i.done).map(itemDateKey)), [items]);

  const allDayTasks = items.filter(item => isTaskForDate(item, dateKey));
  const spentToday = items.filter(i => i.type === 'expense' && i.date === dateKey && !(i as any).excluded).reduce((t, i) => t + (Number(i.amount) || 0), 0);
  const completed = allDayTasks.filter(item => item.done).length;
  const open = allDayTasks.length - completed; // keep open count for tasks only
  const overdue = items.filter(item => item.type === 'task' && !item.done && item.dueDate && item.dueDate < today).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  const filtered = allDayTasks.filter(item => {
    if (filter === 'Open' && item.done) return false;
    if (filter === 'Completed' && !item.done) return false;
    return true;
  });

  // On "All" the finished tasks fold under a "Completed" row at the bottom; "Open" and "Completed" filter as before
  const shown = filter === 'All' ? filtered.filter(item => !item.done) : filtered;
  const doneItems = filter === 'All' ? filtered.filter(item => item.done) : [];
  const [doneOpen, setDoneOpen] = useState(false);
  const anytime = shown.filter(item => !itemTime(item)).sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high'));
  const scheduled = shown.filter(item => itemTime(item)).sort((a, b) => (timeToMinutes(itemTime(a)) ?? 0) - (timeToMinutes(itemTime(b)) ?? 0));

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


  /** Moves a task to another day (its time stays). */
  async function moveTo(item: PlannerItem, key: string) {
    setMoving(null);
    triggerHaptic('success');
    try {
      await updateItem(item.id, { dueDate: key });
    } catch {
      setActionError('Could not move this task. Please try again.');
    }
  }

  function renderItem(item: PlannerItem, hideTime = false) {
    return renderTask(item, hideTime);
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
          onLongPress={item.kind === 'card_bill' ? undefined : () => { triggerHaptic('medium'); setMoving(item); }}
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
            <>
              {dateKey !== today && (
                <Pressable accessibilityRole="button" accessibilityLabel="Back to today" hitSlop={8} onPress={() => { triggerHaptic('light'); setDailyDate(new Date()); }} style={[styles.todayBtn, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>Today</Text>
                </Pressable>
              )}
              <HeaderButton label={showFilter || filter !== 'All' ? 'Hide filters' : 'Filter tasks'} onPress={() => setShowFilter(!showFilter)}>
                <SlidersHorizontal color={filter !== 'All' ? c.accent : c.text} size={19} />
              </HeaderButton>
              <HeaderButton label="Add task" onPress={() => openEditor()} filled>
                <Plus color={c.onAccent} size={20} strokeWidth={2.5} />
              </HeaderButton>
            </>
          }
        />

        <View style={styles.content}>
          {/* Day summary: one line and a thin bar (hidden on an empty day; the empty state says it) */}
          {(loading || allDayTasks.length > 0) && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.summary, { color: c.textSecondary }]}>
                <Text style={{ color: c.text, fontWeight: '800' }}>{loading ? '…' : open === 0 && completed > 0 ? 'All done' : `${open} to go`}</Text>
                {`  ·  ${completed} of ${allDayTasks.length} done`}
                {spentToday > 0 ? `  ·  ₹${Math.round(spentToday).toLocaleString('en-IN')} spent` : ''}
              </Text>
              <View style={[styles.progressTrack, { backgroundColor: c.backgroundMuted, height: 4 }]}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: c.accentFill }]} />
              </View>
            </View>
          )}

          {/* Days: scroll sideways; the chosen day stays centred */}
          <ScrollView
            ref={strip}
            horizontal
            showsHorizontalScrollIndicator={false}
            onLayout={e => setStripW(e.nativeEvent.layout.width)}
            // The days only exist once the content is measured: centre then (no animation on the first open)
            onContentSizeChange={() => { if (!tappedDay.current) centreOnSelected(false); }}
            contentContainerStyle={{ paddingVertical: 2 }}
            style={styles.weekRow}
          >
            {days.map(day => {
              const key = formatDateKey(day);
              const selected = key === dateKey;
              const isDayToday = key === today;
              const hasTasks = busyDays.has(key);
              const firstOfMonth = day.getDate() === 1;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    triggerHaptic('light');
                    if (key !== dateKey) tappedDay.current = true;
                    setDailyDate(day);
                  }}
                  style={[styles.weekDay, { width: DAY_W - 4, marginRight: 4 }, selected && { backgroundColor: c.accentFill }]}
                >
                  <Text style={[styles.weekLabel, { color: selected ? c.onAccent : firstOfMonth ? c.accent : c.textTertiary }]}>
                    {(firstOfMonth ? day.toLocaleDateString('en-US', { month: 'short' }) : day.toLocaleDateString('en-US', { weekday: 'short' })).toUpperCase()}
                  </Text>
                  <Text style={[styles.weekNum, { color: selected ? c.onAccent : isDayToday ? c.accent : c.text }]}>
                    {day.getDate()}
                  </Text>
                  <View style={[styles.weekDot, { backgroundColor: hasTasks ? (selected ? c.onAccent : c.textTertiary) : 'transparent' }]} />
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Overdue: a folded list on today, with one-tap Move buttons */}
          {dateKey === today && overdue.length > 0 && (
            <View style={[styles.overdueBox, { backgroundColor: c.warningSoft }]}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: overdueOpen }} onPress={() => { triggerHaptic('light'); setOverdueOpen(!overdueOpen); }} style={styles.overdueHead}>
                <View style={[styles.noticeDot, { backgroundColor: c.warning }]} />
                <Text style={{ color: c.text, flex: 1, fontSize: 13, fontWeight: '700' }}>
                  Overdue ({overdue.length})
                </Text>
                {overdueOpen ? <ChevronUp color={c.warning} size={18} /> : <ChevronDown color={c.warning} size={18} />}
              </Pressable>
              {overdueOpen && (
                <View style={{ gap: 10, paddingHorizontal: 10, paddingBottom: 12 }}>
                  {overdue.some(i => i.kind !== 'card_bill') && (
                    <Pressable accessibilityRole="button" onPress={() => { for (const i of overdue) if (i.kind !== 'card_bill') void moveTo(i, today); }} style={[styles.moveAll, { backgroundColor: c.accentFill }]}>
                      <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 13 }}>Move all to today</Text>
                    </Pressable>
                  )}
                  {overdue.map(item => (
                    <View key={item.id} style={{ gap: 6 }}>
                      {renderTask(item, false)}
                      {item.kind !== 'card_bill' && (
                        <View style={styles.moveRow}>
                          {moveOptions(today, item.dueDate).map(o => (
                            <Pressable key={o.key} accessibilityRole="button" accessibilityLabel={`Move ${item.title} to ${o.label}`} onPress={() => void moveTo(item, o.key)}
                              style={[styles.moveChip, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                              <Text style={{ color: c.text, fontWeight: '600', fontSize: 12 }}>{o.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Filter: behind the icon in the header; open while one is chosen */}
          {(showFilter || filter !== 'All') && <View style={[styles.segmentedControl, { backgroundColor: c.backgroundMuted }]}>
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
          </View>}

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
                      <View style={{ flex: 1 }}>{renderItem(item, true)}</View>
                    </View>
                  ))}
                </>
              )}

              {anytime.length > 0 && (
                <>
                  <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>Anytime</Text>
                  {anytime.map(item => renderItem(item))}
                </>
              )}

              {doneItems.length > 0 && (
                <>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: doneOpen }} onPress={() => { triggerHaptic('light'); setDoneOpen(!doneOpen); }} style={styles.doneHead}>
                    <Check color={c.textTertiary} size={15} strokeWidth={3} />
                    <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, flex: 1, textTransform: 'uppercase' }}>Completed ({doneItems.length})</Text>
                    {doneOpen ? <ChevronUp color={c.textTertiary} size={16} /> : <ChevronDown color={c.textTertiary} size={16} />}
                  </Pressable>
                  {doneOpen && doneItems.map(item => renderItem(item))}
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

      <MoveSheet item={moving} today={today} onMove={(it, key) => void moveTo(it, key)} onPick={it => { setMoving(null); openEditor(it); }} onClose={() => setMoving(null)} />

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
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 6 },
  summary: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], marginBottom: 8 },
  todayBtn: { paddingHorizontal: 12, height: 40, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  overdueBox: { borderRadius: Radius.md, marginBottom: 14, overflow: 'hidden' },
  overdueHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  moveAll: { alignItems: 'center', paddingVertical: 10, borderRadius: Radius.md },
  moveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 4 },
  moveChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  moveSheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 20, paddingBottom: 34, gap: 10 },
  moveOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: Radius.md, borderWidth: 1 },
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
    fontSize: 11,
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
