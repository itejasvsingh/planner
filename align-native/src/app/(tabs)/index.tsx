import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronLeft, ChevronRight, Menu, Plus, Search, Sunrise, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatDateKey, startOfWeek, timeToMinutes, todayKey } from '@/lib/dates';
import { usePhone } from '@/lib/phone-context';
import { isTaskForDate, itemTime, type PlannerItem } from '@/lib/planner-item';
import { usePlannerItems } from '@/lib/use-planner-items';
import DrawerMenuModal from '@/components/DrawerMenuModal';
import ItemModal from '@/components/ItemModal';
import TaskCard from '@/components/TaskCard';

const FILTERS = ['All', 'Open', 'High priority', 'Completed'] as const;
type Filter = typeof FILTERS[number];

export default function DailyScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, loading, error, toggleDone } = usePlannerItems(phone);
  const [dailyDate, setDailyDate] = useState(() => new Date());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('Open');
  const [search, setSearch] = useState('');
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
  const query = search.trim().toLowerCase();
  const filtered = allDayTasks.filter(item => {
    if (filter === 'Open' && item.done) return false;
    if (filter === 'Completed' && !item.done) return false;
    if (filter === 'High priority' && (item.done || item.priority !== 'high')) return false;
    return !query || `${item.title} ${(item.subtasks || []).map(s => s.title).join(' ')}`.toLowerCase().includes(query);
  });
  const anytime = filtered.filter(item => !itemTime(item)).sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high'));
  const scheduled = filtered.filter(item => itemTime(item)).sort((a, b) => (timeToMinutes(itemTime(a)) ?? 0) - (timeToMinutes(itemTime(b)) ?? 0));
  const progress = allDayTasks.length ? completed / allDayTasks.length : 0;
  function openEditor(item: PlannerItem | null = null) { setEditingItem(item); setModalOpen(true); }
  async function complete(item: PlannerItem) {
    setActionError('');
    try { await toggleDone(item.id, !!item.done); } catch { setActionError('Could not update this task. Please try again.'); }
  }
  function renderTask(item: PlannerItem) {
    return <TaskCard key={item.id} item={item} theme={theme} today={today} onToggle={() => void complete(item)} onPress={() => openEditor(item)} />;
  }
  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <View style={styles.brand}><View style={[styles.brandMark, { backgroundColor: theme.blue }]}><Check size={19} color="#fff" strokeWidth={3} /></View><Text style={[styles.brandText, { color: theme.text }]}>align<Text style={{ color: theme.blue }}>.</Text></Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={() => setIsDrawerOpen(true)} style={[styles.iconButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}><Menu color={theme.text} size={21} /></Pressable>
        </View>
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: theme.textSecondary }]}>{dailyDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text><Text style={[styles.title, { color: theme.text }]}>{dateKey === today ? 'Make room for today.' : 'A little planning goes far.'}</Text><Text style={[styles.subtitle, { color: theme.textSecondary }]}>Your day, one meaningful step at a time.</Text></View>
        </View>
        <View style={[styles.overview, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.summaryTop}><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: theme.blue }]}>DAILY FOCUS</Text><Text style={[styles.focusTitle, { color: theme.text }]}>{loading && !items.length ? 'Getting your day ready…' : open ? `${open} ${open === 1 ? 'task' : 'tasks'} left to make it count` : completed ? 'Everything checked off. Well done.' : 'A fresh start, at your pace.'}</Text></View><View style={[styles.sun, { backgroundColor: theme.backgroundSelected }]}><Sunrise color={theme.blue} size={26} /></View></View>
          <View accessibilityRole="progressbar" accessibilityLabel="Daily completion" accessibilityValue={{ min: 0, max: allDayTasks.length || 1, now: completed }} style={[styles.progressTrack, { backgroundColor: theme.background }]}><View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: theme.blue, borderRadius: 4 }} /></View>
          <View style={styles.summaryBottom}><Text style={[styles.caption, { color: theme.textSecondary }]}>{completed} of {allDayTasks.length} completed</Text><Text style={[styles.caption, { color: theme.blue }]}>{Math.round(progress * 100)}%</Text></View>
        </View>
        <View style={styles.dateNav}><Text style={[styles.sectionTitle, { color: theme.text }]}>{dailyDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text><View style={styles.dateActions}><Pressable accessibilityRole="button" accessibilityLabel="Previous week" onPress={() => setDailyDate(d => addDays(d, -7))} style={styles.smallButton}><ChevronLeft size={19} color={theme.textSecondary} /></Pressable><Pressable accessibilityRole="button" onPress={() => setDailyDate(new Date())} style={[styles.todayButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}><Text style={{ color: theme.blue, fontSize: 12, fontWeight: '700' }}>Today</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Next week" onPress={() => setDailyDate(d => addDays(d, 7))} style={styles.smallButton}><ChevronRight size={19} color={theme.textSecondary} /></Pressable></View></View>
        <View style={styles.weekRow}>{weekDays.map(day => {
          const key = formatDateKey(day); const selected = key === dateKey; const hasTasks = items.some(item => isTaskForDate(item, key) && !item.done);
          return <Pressable key={key} accessibilityRole="button" accessibilityLabel={day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} accessibilityState={{ selected }} onPress={() => setDailyDate(day)} style={[styles.weekDay, { backgroundColor: selected ? theme.blue : theme.backgroundElement, borderColor: selected ? theme.blue : theme.border }]}><Text style={[styles.weekLabel, { color: selected ? '#fff' : theme.textSecondary }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text><Text style={[styles.weekNum, { color: selected ? '#fff' : theme.text }]}>{day.getDate()}</Text><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: hasTasks ? selected ? '#fff' : theme.blue : 'transparent' }} /></Pressable>;
        })}</View>
        {dateKey === today && overdue.length > 0 && <Pressable accessibilityRole="button" onPress={() => setDailyDate(new Date(`${overdue.map(i => i.dueDate!).sort()[0]}T12:00:00`))} style={[styles.notice, { backgroundColor: theme.backgroundSelected }]}><Text style={{ color: theme.text, flex: 1, fontSize: 13 }}>{overdue.length} overdue {overdue.length === 1 ? 'task needs' : 'tasks need'} a new plan</Text><Text style={{ color: theme.blue, fontWeight: '700', fontSize: 13 }}>Review →</Text></Pressable>}
        <View style={styles.dateNav}><Text style={[styles.sectionTitle, { color: theme.text }]}>Your agenda</Text><Pressable accessibilityRole="button" onPress={() => openEditor()} style={[styles.addButton, { backgroundColor: theme.blue }]}><Plus size={16} color="#fff" /><Text style={styles.addText}>Add task</Text></Pressable></View>
        <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}><Search size={18} color={theme.textSecondary} /><TextInput accessibilityLabel="Search tasks for selected day" placeholder="Find a task in this day…" placeholderTextColor={theme.textSecondary} value={search} onChangeText={setSearch} style={[styles.searchInput, { color: theme.text }]} />{!!search && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')}><X size={18} color={theme.textSecondary} /></Pressable>}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{FILTERS.map(f => <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)} style={[styles.filter, { backgroundColor: filter === f ? theme.backgroundSelected : 'transparent' }]}><Text style={{ color: filter === f ? theme.blue : theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{f}</Text></Pressable>)}</ScrollView>
        {!!(error || actionError) && <Text accessibilityRole="alert" style={{ color: theme.red, marginBottom: 16 }}>{actionError || error}</Text>}
        {loading && !items.length ? <ActivityIndicator color={theme.blue} style={{ margin: 32 }} /> : filtered.length === 0 ? <View style={[styles.empty, { borderColor: theme.border }]}><View style={[styles.sun, { backgroundColor: theme.backgroundSelected }]}><Check size={26} color={theme.blue} /></View><Text style={[styles.emptyTitle, { color: theme.text }]}>{query ? 'No matching tasks' : filter === 'Completed' ? 'Your wins will appear here' : allDayTasks.length ? 'Nothing in this filter' : 'A little space for what matters'}</Text><Text style={[styles.emptyText, { color: theme.textSecondary }]}>{query ? 'Try another word or clear your search.' : allDayTasks.length ? 'Choose All to see everything planned for this day.' : 'Add your first task. Keep it small, make it yours.'}</Text><Pressable accessibilityRole="button" onPress={() => { if (query) setSearch(''); else if (allDayTasks.length) setFilter('All'); else openEditor(); }}><Text style={{ color: theme.blue, fontWeight: '700', marginTop: 6 }}>{query ? 'Clear search' : allDayTasks.length ? 'Show all tasks' : '+ Plan something'}</Text></Pressable></View> : <>{anytime.length > 0 && <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>ANYTIME · {anytime.length}</Text>}{anytime.map(renderTask)}{scheduled.length > 0 && <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>SCHEDULED · {scheduled.length}</Text>}{scheduled.map(item => <View key={item.id}><Text style={[styles.time, { color: theme.blue }]}>{itemTime(item)}</Text>{renderTask(item)}</View>)}</>}
      </ScrollView>
      <DrawerMenuModal visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      <ItemModal visible={modalOpen} onClose={() => setModalOpen(false)} initialItem={editingItem} defaultDate={dateKey} />
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { padding: 22, paddingBottom: 150, width: '100%', maxWidth: 880, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandMark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, brandText: { fontSize: 25, fontWeight: '800', letterSpacing: -1 },
  iconButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }, headingRow: { marginBottom: 24 }, eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 }, title: { fontSize: 31, lineHeight: 39, fontWeight: '700', letterSpacing: -1.1, marginTop: 10 }, subtitle: { fontSize: 14, lineHeight: 22, marginTop: 6 },
  overview: { borderWidth: 1, borderRadius: 20, padding: 20, marginBottom: 26 }, summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 }, focusTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600', marginTop: 7 }, sun: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, progressTrack: { height: 6, borderRadius: 4, marginTop: 20, overflow: 'hidden' }, summaryBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }, caption: { fontSize: 12, fontWeight: '500' },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }, sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 }, dateActions: { flexDirection: 'row', alignItems: 'center', gap: 4 }, smallButton: { padding: 9 }, todayButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 }, weekRow: { flexDirection: 'row', gap: 6, marginBottom: 26 }, weekDay: { flex: 1, alignItems: 'center', borderWidth: 1, paddingVertical: 12, borderRadius: 14, gap: 6 }, weekLabel: { fontSize: 10, fontWeight: '500' }, weekNum: { fontSize: 18, fontWeight: '700' }, notice: { padding: 14, borderRadius: 12, marginBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 13, borderRadius: 11 }, addText: { color: '#fff', fontSize: 12, fontWeight: '700' }, search: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, gap: 10 }, searchInput: { flex: 1, fontSize: 14, minHeight: 46 }, filters: { gap: 5, paddingVertical: 14 }, filter: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9 }, empty: { alignItems: 'center', padding: 28, gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 18 }, emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' }, emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 300 }, groupLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginTop: 6, marginBottom: 12 }, time: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
});
