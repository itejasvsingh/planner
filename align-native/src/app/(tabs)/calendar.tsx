import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { ChevronLeft, ChevronRight, Plus, Menu } from 'lucide-react-native';

import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { formatDateKey, todayKey } from '@/lib/dates';
import { type PlannerItem, isTaskForDate } from '@/lib/planner-item';

import TaskCard from '@/components/TaskCard';
import SwipeAction from '@/components/SwipeAction';
import ItemModal from '@/components/ItemModal';
import DrawerMenuModal from '@/components/DrawerMenuModal';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function CalendarScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, toggleDone, deleteItem } = usePlannerItems(phone);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingItem, setEditingItem] = useState<PlannerItem | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => setIsDrawerOpen(true)} style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.7 : 1, marginRight: 12 }]}>
          <Menu color={theme.text} size={28} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Calendar</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.monthSelector}>
          <Pressable onPress={() => changeMonth(-1)} style={styles.monthArrow}>
            <ChevronLeft color={theme.blue} size={24} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: theme.text }]}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable onPress={() => changeMonth(1)} style={styles.monthArrow}>
            <ChevronRight color={theme.blue} size={24} />
          </Pressable>
        </View>

        <View style={styles.calendarGrid}>
          <View style={styles.weekDaysRow}>
            {DAY_LABELS.map((d, i) => (
              <Text key={i} style={[styles.weekDayLabel, { color: theme.textSecondary }]}>{d}</Text>
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
                  onPress={() => setSelectedDate(dateObj)}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: theme.blue }
                  ]}
                >
                  <Text style={[
                    styles.dayNumber,
                    { color: isSelected ? '#fff' : (isToday ? theme.blue : theme.text) },
                    isToday && !isSelected && { fontWeight: '800' }
                  ]}>
                    {dateObj.getDate()}
                  </Text>
                  
                  <View style={styles.dotsRow}>
                    {pendingCount > 0 && <View style={[styles.dot, { backgroundColor: isSelected ? 'rgba(255,255,255,0.7)' : theme.blue }]} />}
                    {completedCount > 0 && <View style={[styles.dot, { backgroundColor: isSelected ? 'rgba(255,255,255,0.4)' : '#34C759' }]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.agendaSection}>
          <Text style={[styles.agendaHeader, { color: theme.textSecondary }]}>
            {selectedKey === today ? 'TODAY' : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </Text>
          
          {selectedDayItems.length === 0 ? (
            <View style={styles.emptyAgenda}>
              <Text style={{ color: theme.textSecondary }}>No items for this day.</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16 }}>
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
      </ScrollView>

      <Pressable
        style={[styles.fab, { backgroundColor: theme.blue, shadowColor: theme.blue }]}
        onPress={() => setIsAddingItem(true)}>
        <Plus color="#fff" size={32} />
      </Pressable>

      <ItemModal
        visible={!!editingItem || isAddingItem}
        onClose={() => { setEditingItem(null); setIsAddingItem(false); }}
        initialItem={editingItem}
        defaultDate={selectedKey}
      />
      <DrawerMenuModal visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
const CELL_SIZE = (width - 32) / 7;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  monthArrow: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  calendarGrid: {
    paddingHorizontal: 16,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 17,
    fontWeight: '500',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
    height: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  agendaSection: {
    marginTop: 24,
  },
  agendaHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: 20,
    marginBottom: 12,
  },
  emptyAgenda: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  }
});
