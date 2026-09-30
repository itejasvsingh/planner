import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { Radius, Shadow } from '@/constants/theme';

import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { formatDateKey, todayKey } from '@/lib/dates';
import { type PlannerItem, isTaskForDate } from '@/lib/planner-item';

import TaskCard from '@/components/TaskCard';
import SwipeAction from '@/components/SwipeAction';
import ItemModal from '@/components/ItemModal';
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import ScreenHeader, { HeaderButton } from '@/components/ScreenHeader';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, toggleDone, deleteItem } = usePlannerItems(phone);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingItem, setEditingItem] = useState<PlannerItem | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);

  const today = todayKey();
  const selectedKey = formatDateKey(selectedDate);

  const monthGrid = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [currentMonth]);

  const selectedDayItems = useMemo(() => {
    return items.filter((item) => isTaskForDate(item, selectedKey));
  }, [items, selectedKey]);

  const changeMonth = (delta: number) => {
    setCurrentMonth(prev => {
      const d = new Date(prev);
      d.setDate(1);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  };

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
          <Text style={[styles.monthLabel, { color: theme.text }]}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={[styles.monthArrow, { backgroundColor: theme.backgroundMuted }]}>
              <ChevronLeft color={theme.text} size={18} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={[styles.monthArrow, { backgroundColor: theme.backgroundMuted }]}>
              <ChevronRight color={theme.text} size={18} />
            </Pressable>
          </View>
        </View>

        <View style={styles.calendarGrid}>
          <View style={styles.weekDaysRow}>
            {DAY_LABELS.map((d, i) => (
              <Text key={i} style={[styles.weekDayLabel, { color: theme.textTertiary }]}>{d}</Text>
            ))}
          </View>
          
          <View style={styles.daysGrid}>
            {monthGrid.map((dateObj, i) => {
              if (!dateObj) return <View key={`empty-${i}`} style={styles.dayCell} />;
              
              const key = formatDateKey(dateObj);
              const isSelected = key === selectedKey;
              const isToday = key === today;
              
              const dayItems = items.filter(it => isTaskForDate(it, key));
              const pendingCount = dayItems.filter(it => it.type === 'task' && !it.done).length;
              const completedCount = dayItems.filter(it => it.type === 'task' && it.done).length;

              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={dateObj.toLocaleDateString()}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedDate(dateObj)}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: theme.accentFill },
                    isToday && !isSelected && { borderWidth: 1.5, borderColor: theme.accent },
                  ]}
                >
                  <Text style={[
                    styles.dayNumber,
                    { color: isSelected ? theme.onAccent : (isToday ? theme.accent : theme.text) },
                    (isToday || isSelected) && { fontWeight: '800' }
                  ]}>
                    {dateObj.getDate()}
                  </Text>
                  
                  <View style={styles.dotsRow}>
                    {pendingCount > 0 && <View style={[styles.dot, { backgroundColor: isSelected ? theme.onAccent : theme.textSecondary }]} />}
                    {completedCount > 0 && <View style={[styles.dot, { backgroundColor: isSelected ? theme.onAccent : theme.accent, opacity: isSelected ? 0.45 : 1 }]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        </View>

        <View style={styles.agendaSection}>
          <Text style={[styles.agendaHeader, { color: theme.textTertiary }]}>
            {selectedKey === today ? 'TODAY' : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </Text>
          
          {selectedDayItems.length === 0 ? (
            <View style={[styles.emptyAgenda, { borderColor: theme.border }]}>
              <Text style={{ color: theme.textSecondary }}>Nothing planned for this day.</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
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
                    isSwipable
                  />
                </SwipeAction>
              ))}
            </View>
          )}
        </View>
        </View>
      </ScrollView>


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
  todayBtn: { height: 40, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthCard: { borderWidth: 1, borderRadius: Radius.lg, padding: 12, paddingTop: 14 },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
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
    fontSize: 11,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285714%',
    height: 46,
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
    marginTop: 20,
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
