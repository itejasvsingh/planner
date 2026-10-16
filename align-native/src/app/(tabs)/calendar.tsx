import { useRef, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { CalendarClock, ChevronLeft, ChevronRight, CreditCard, Plus } from 'lucide-react-native';
import { Radius, Shadow } from '@/constants/theme';

import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { addDays, formatDateKey, startOfWeek, todayKey } from '@/lib/dates';
import { type PlannerItem, isTaskForDate, itemDateKey } from '@/lib/planner-item';
import { useCards } from '@/lib/cards-store';
import { adjustBalances } from '@/lib/account-balances';
import { cardTitle } from '@/lib/card-format';
import { paymentsBetween, type Upcoming } from '@/lib/upcoming';
import { triggerHaptic } from '@/lib/haptics';

import TaskCard from '@/components/TaskCard';
import SwipeAction from '@/components/SwipeAction';
import ItemModal from '@/components/ItemModal';
import MoveSheet from '@/components/MoveSheet';
import SegmentedControl from '@/components/SegmentedControl';
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import ScreenHeader, { HeaderButton } from '@/components/ScreenHeader';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, toggleDone, deleteItem, updateItem } = usePlannerItems(phone);
  const router = useRouter();
  const cardData = useCards(phone);
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [moving, setMoving] = useState<PlannerItem | null>(null);
  // Under the calendar: the chosen day's list, or everything finished this month grouped by day
  const [listMode, setListMode] = useState<'day' | 'done'>('day');
  const swipeX = useRef<number | null>(null);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingItem, setEditingItem] = useState<PlannerItem | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);

  const today = todayKey();
  const selectedKey = formatDateKey(selectedDate);

  // The days on screen: the month (padded to start on Sunday), or just the week of the chosen day
  const cells = useMemo(() => {
    if (mode === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selectedDate), i)) as (Date | null)[];
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, month, d));
    return out;
  }, [mode, currentMonth, selectedDate]);

  // Tasks per day (to do / done / overdue) and the bills and card dues falling on each day
  const dayInfo = useMemo(() => {
    const map = new Map<string, { pending: number; done: number }>();
    for (const it of items) {
      if (it.type !== 'task') continue;
      const k = itemDateKey(it);
      if (!k) continue;
      const e = map.get(k) || { pending: 0, done: 0 };
      if (it.done) e.done++; else e.pending++;
      map.set(k, e);
    }
    return map;
  }, [items]);
  const adjusted = useMemo(() => (cardData ? adjustBalances(cardData.accounts || [], cardData.cards || [], items) : null), [cardData, items]);
  const moneyByDay = useMemo(() => {
    const days = cells.filter((d): d is Date => !!d);
    if (!days.length) return new Map<string, Upcoming[]>();
    const list = paymentsBetween(
      items as any,
      (adjusted?.cards || []).map(k => ({ title: cardTitle(k), dueDate: k.dueDate, outstanding: k.outstanding, hidden: k.hidden, status: k.status })),
      formatDateKey(days[0]),
      formatDateKey(days[days.length - 1]),
    );
    const map = new Map<string, Upcoming[]>();
    for (const u of list) map.set(u.date, [...(map.get(u.date) || []), u]);
    return map;
  }, [cells, items, adjusted]);

  const selectedDayItems = useMemo(() => items.filter((item) => isTaskForDate(item, selectedKey)), [items, selectedKey]);
  const selectedMoney = moneyByDay.get(selectedKey) || [];

  // Finished tasks of the month on screen, newest day first
  const monthPrefix = formatDateKey(currentMonth).slice(0, 7);
  const doneByDay = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    for (const it of items) {
      if (it.type !== 'task' || !it.done) continue;
      const k = itemDateKey(it);
      if (!k || !k.startsWith(monthPrefix)) continue;
      map.set(k, [...(map.get(k) || []), it]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items, monthPrefix]);
  const doneCount = doneByDay.reduce((t, [, list]) => t + list.length, 0);

  // Arrows and swiping step a month, or a week in the week view
  const step = (delta: number) => {
    triggerHaptic('light');
    if (mode === 'week') {
      const d = addDays(selectedDate, 7 * delta);
      setSelectedDate(d);
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    }
  };
  const label = mode === 'week'
    ? (() => { const a = cells[0] as Date; const b = cells[6] as Date; return `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString('en-US', { month: a.getMonth() === b.getMonth() ? undefined : 'short', day: 'numeric' })}, ${b.getFullYear()}`; })()
    : currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  async function moveTo(item: PlannerItem, key: string) {
    setMoving(null);
    triggerHaptic('success');
    await updateItem(item.id, { dueDate: key });
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false} onScroll={collapseQuickAddOnScroll} scrollEventThrottle={16}>
        <ScreenHeader
          title="Calendar"
          subtitle="See the space ahead."
          actions={
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
                style={[styles.todayBtn, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
              >
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Today</Text>
              </Pressable>
              <HeaderButton label="Add task for selected date" onPress={() => setIsAddingItem(true)} filled>
                <Plus size={20} color={theme.onAccent} strokeWidth={2.5} />
              </HeaderButton>
            </>
          }
        />

        <View style={styles.body}>
        <View style={[styles.monthCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, Shadow.card]}>
        <View style={styles.monthSelector}>
          <Text style={[styles.monthLabel, { color: theme.text }]}>{label}</Text>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={mode === 'month' ? 'Show one week' : 'Show the month'} onPress={() => { triggerHaptic('light'); setMode(mode === 'month' ? 'week' : 'month'); }}
              style={[styles.modeBtn, { backgroundColor: theme.backgroundMuted }]}>
              <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 12 }}>{mode === 'month' ? 'Week' : 'Month'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={mode === 'week' ? 'Previous week' : 'Previous month'} onPress={() => step(-1)} style={[styles.monthArrow, { backgroundColor: theme.backgroundMuted }]}>
              <ChevronLeft color={theme.text} size={18} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={mode === 'week' ? 'Next week' : 'Next month'} onPress={() => step(1)} style={[styles.monthArrow, { backgroundColor: theme.backgroundMuted }]}>
              <ChevronRight color={theme.text} size={18} />
            </Pressable>
          </View>
        </View>

        <View
          style={styles.calendarGrid}
          // Swipe sideways to go to the next or previous month (week)
          onTouchStart={e => { swipeX.current = e.nativeEvent.pageX; }}
          onTouchEnd={e => {
            const start = swipeX.current;
            swipeX.current = null;
            if (start === null) return;
            const dx = e.nativeEvent.pageX - start;
            if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
          }}
        >
          <View style={styles.weekDaysRow}>
            {DAY_LABELS.map((d, i) => (
              <Text key={i} style={[styles.weekDayLabel, { color: theme.textTertiary }]}>{d}</Text>
            ))}
          </View>
          
          <View style={styles.daysGrid}>
            {cells.map((dateObj, i) => {
              if (!dateObj) return <View key={`empty-${i}`} style={styles.dayCell} />;

              const key = formatDateKey(dateObj);
              const isSelected = key === selectedKey;
              const isToday = key === today;
              const info = dayInfo.get(key);
              const pendingCount = info?.pending || 0;
              const completedCount = info?.done || 0;
              const overdueDay = key < today && pendingCount > 0;
              const hasMoney = (moneyByDay.get(key) || []).length > 0;
              const busy = pendingCount >= 3;
              const onSel = theme.onAccent;

              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${dateObj.toLocaleDateString()}${pendingCount ? `, ${pendingCount} to do` : ''}${hasMoney ? ', a payment is due' : ''}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedDate(dateObj)}
                  style={[
                    styles.dayCell,
                    busy && !isSelected && { backgroundColor: theme.accentSoft },
                    isSelected && { backgroundColor: theme.accentFill },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.accent },
                  ]}
                >
                  <Text style={[
                    styles.dayNumber,
                    { color: isSelected ? onSel : (isToday ? theme.accent : theme.text) },
                    (isToday || isSelected) && { fontWeight: '800' }
                  ]}>
                    {dateObj.getDate()}
                  </Text>

                  <View style={styles.dotsRow}>
                    {overdueDay && <View style={[styles.dot, { backgroundColor: isSelected ? onSel : theme.expense }]} />}
                    {pendingCount > 0 && !overdueDay && <View style={[styles.dot, { backgroundColor: isSelected ? onSel : theme.textSecondary }]} />}
                    {completedCount > 0 && <View style={[styles.dot, { backgroundColor: isSelected ? onSel : theme.accent, opacity: isSelected ? 0.45 : 1 }]} />}
                    {hasMoney && <View style={[styles.dot, { borderRadius: 1, backgroundColor: isSelected ? onSel : theme.warning }]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        </View>

        <View style={styles.agendaSection}>
          <SegmentedControl tabs={['Selected day', 'Done this month']} activeTab={listMode === 'day' ? 'Selected day' : 'Done this month'} onTabChange={t => setListMode(t === 'Selected day' ? 'day' : 'done')} />
          <View style={{ height: 10 }} />

          {listMode === 'done' ? (
            doneCount === 0 ? (
              <View style={[styles.emptyAgenda, { borderColor: theme.border }]}>
                <Text style={{ color: theme.textSecondary }}>Nothing finished in {currentMonth.toLocaleDateString('en-US', { month: 'long' })} yet.</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={[styles.agendaHeader, { color: theme.textTertiary, marginBottom: 2 }]}>
                  {doneCount} DONE IN {currentMonth.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()}
                </Text>
                {doneByDay.map(([key, list]) => (
                  <View key={key} style={{ gap: 8 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${key}`} onPress={() => { setSelectedDate(new Date(`${key}T12:00:00`)); setListMode('day'); }} style={styles.doneDayHead}>
                      <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>
                        {new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '600' }}>{list.length} done</Text>
                    </Pressable>
                    {list.map(item => (
                      <TaskCard
                        key={item.id}
                        item={item}
                        theme={theme}
                        today={today}
                        onToggle={() => void toggleDone(item.id, !!item.done)}
                        onPress={() => setEditingItem(item)}
                      />
                    ))}
                  </View>
                ))}
              </View>
            )
          ) : (<>
          <Text style={[styles.agendaHeader, { color: theme.textTertiary }]}>
            {selectedKey === today ? 'TODAY' : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </Text>
          {selectedDayItems.length === 0 && selectedMoney.length === 0 ? (
            <View style={[styles.emptyAgenda, { borderColor: theme.border }]}>
              <Text style={{ color: theme.textSecondary }}>Nothing planned for this day.</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {selectedMoney.map(u => (
                <Pressable key={u.key} accessibilityRole="button" accessibilityLabel={`${u.title}, due. Open Wallet`} onPress={() => router.push('/(tabs)/wallet' as any)}
                  style={[styles.moneyRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <View style={[styles.moneyIcon, { backgroundColor: theme.warningSoft }]}>
                    {u.kind === 'card' ? <CreditCard color={theme.warning} size={17} /> : <CalendarClock color={theme.warning} size={17} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{u.title}</Text>
                    <Text style={{ color: theme.textTertiary, fontSize: 12 }}>{u.kind === 'card' ? 'Card bill due' : 'Bill due'}</Text>
                  </View>
                  {u.amount > 0 && <Text style={{ color: theme.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>₹{Math.round(u.amount).toLocaleString('en-IN')}</Text>}
                </Pressable>
              ))}
              {selectedDayItems.map(item => (
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
                    onPress={() => setEditingItem(item)}
                    onLongPress={item.kind === 'card_bill' ? undefined : () => { triggerHaptic('medium'); setMoving(item); }}
                    isSwipable
                  />
                </SwipeAction>
              ))}
            </View>
          )}
          </>)}
        </View>
        </View>
      </ScrollView>


      <MoveSheet item={moving} today={today} onMove={(it, key) => void moveTo(it, key)} onPick={it => { setMoving(null); setEditingItem(it); }} onClose={() => setMoving(null)} />

      <ItemModal
        visible={!!editingItem || isAddingItem}
        onClose={() => { setEditingItem(null); setIsAddingItem(false); }}
        initialItem={editingItem}
        defaultDate={selectedKey}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { paddingHorizontal: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  doneDayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  modeBtn: { height: 32, paddingHorizontal: 10, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  moneyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.lg, borderWidth: 1 },
  moneyIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { height: 40, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthCard: { borderWidth: 1, borderRadius: Radius.lg, padding: 10, paddingTop: 12 },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  calendarGrid: {},
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekDayLabel: {
    width: '14.285714%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285714%',
    // Compact rows so the selected day's tasks start above the fold.
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  dayNumber: {
    fontSize: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 3,
    height: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  agendaSection: {
    marginTop: 14,
  },
  agendaHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  emptyAgenda: {
    alignItems: 'center',
    paddingVertical: 28,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
  },
});
