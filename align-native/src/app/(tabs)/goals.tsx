import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Target, Plus, Check, Menu, ArrowUpRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { type PlannerItem } from '@/lib/planner-item';
import ItemModal from '@/components/ItemModal';
import DrawerMenuModal from '@/components/DrawerMenuModal';

export default function GoalsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { phone } = usePhone();
  const { items, loading, error, updateGoalProgress } = usePlannerItems(phone);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const topPadding = Platform.OS === 'web'
    ? ('calc(env(safe-area-inset-top, 24px) + 14px)' as any)
    : Math.max(insets.top, 24) + 14;

  const goals = items.filter(item => item.type === 'goal');
  const done = goals.filter(goal => (goal.current || 0) >= (goal.target || 1));
  const visible = goals.filter(goal => ((goal.current || 0) >= (goal.target || 1)) === showCompleted);
  function addGoal() { setEditing(null); setModalOpen(true); }
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={() => setDrawerOpen(true)} hitSlop={15} style={styles.iconButton}>
          <Menu color={theme.text} size={24} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Goals</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Small steps. Real progress.</Text>
        </View>
      </View>
      <View style={[styles.summary, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>{[{ label: 'Active goals', value: goals.length - done.length }, { label: 'Milestones reached', value: done.length }].map(stat => <View key={stat.label} style={{ flex: 1 }}><Text style={{ color: theme.blue, fontSize: 30, fontWeight: '700' }}>{stat.value}</Text><Text style={[styles.subtitle, { color: theme.textSecondary }]}>{stat.label}</Text></View>)}</View>
      <View style={styles.toolbar}><View style={{ flexDirection: 'row', gap: 6 }}>{[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: showCompleted === value }} onPress={() => setShowCompleted(value)} style={[styles.filter, { backgroundColor: showCompleted === value ? theme.backgroundSelected : 'transparent' }]}><Text style={{ color: showCompleted === value ? theme.blue : theme.textSecondary, fontSize: 13, fontWeight: '600' }}>{value ? 'Completed' : 'In progress'}</Text></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel="Create goal" onPress={addGoal} style={[styles.add, { backgroundColor: theme.blue }]}><Plus size={16} color="#fff" /><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>New goal</Text></Pressable></View>
      {!!error && <Text accessibilityRole="alert" style={{ color: theme.red }}>{error}</Text>}
      {loading && !items.length ? <ActivityIndicator color={theme.blue} /> : visible.length === 0 ? <View style={[styles.empty, { borderColor: theme.border }]}><Target size={32} color={theme.blue} /><Text style={{ color: theme.text, fontSize: 19, fontWeight: '600' }}>{showCompleted ? 'Your milestones belong here' : 'What would you like to work toward?'}</Text><Text style={[styles.subtitle, { color: theme.textSecondary, textAlign: 'center' }]}>{showCompleted ? 'Keep going. Every small step adds up.' : 'Read 12 books, run 50 km, or build a new habit. Start with one goal.'}</Text>{!showCompleted && <Pressable accessibilityRole="button" onPress={addGoal}><Text style={{ color: theme.blue, fontWeight: '700' }}>Create your first goal →</Text></Pressable>}</View> : visible.map(goal => {
        const target = goal.target || 1; const current = goal.current || 0; const percent = Math.min(100, Math.max(0, current / target * 100)); const complete = current >= target;
        return <View key={goal.id} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}><View style={styles.cardHeader}><View style={[styles.goalIcon, { backgroundColor: theme.backgroundSelected }]}>{complete ? <Check size={22} color={theme.blue} /> : <Target size={22} color={theme.blue} />}</View><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${goal.title}`} style={{ flex: 1 }} onPress={() => { setEditing(goal); setModalOpen(true); }}><Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>{goal.title}</Text><Text style={[styles.subtitle, { color: theme.textSecondary }]}>{current} of {target} {goal.unit || 'steps'}</Text></Pressable>{!complete && <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${goal.unit || 'step'} to ${goal.title}`} onPress={() => void updateGoalProgress(goal.id, current, target)} style={[styles.goalIcon, { backgroundColor: theme.blue }]}><ArrowUpRight size={20} color="#fff" /></Pressable>}</View><View accessibilityRole="progressbar" accessibilityLabel={goal.title} accessibilityValue={{ min: 0, max: target, now: Math.min(current, target) }} style={[styles.track, { backgroundColor: theme.background }]}><View style={{ height: '100%', width: `${percent}%`, backgroundColor: theme.blue, borderRadius: 4 }} /></View><View style={styles.cardFooter}><Text style={{ color: theme.textSecondary, fontSize: 12 }}>{complete ? 'Milestone reached' : goal.date ? `Target · ${goal.date}` : 'Keep moving forward'}</Text><Text style={{ color: theme.blue, fontSize: 12, fontWeight: '700' }}>{Math.round(percent)}%</Text></View></View>;
      })}
    </ScrollView>
    <ItemModal visible={modalOpen} onClose={() => setModalOpen(false)} initialItem={editing} defaultType="goal" />
    <DrawerMenuModal visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
  </View>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 880, alignSelf: 'center', padding: 22, paddingBottom: 150 }, header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 26 }, eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginTop: 12 }, title: { fontSize: 29, fontWeight: '700', lineHeight: 37, letterSpacing: -0.8, marginTop: 10 }, subtitle: { fontSize: 13, lineHeight: 20, marginTop: 5 }, iconButton: { padding: 10 }, summary: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 24, gap: 16 }, toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 20 }, filter: { padding: 10, borderRadius: 9 }, add: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 11, borderRadius: 11 }, empty: { padding: 28, borderWidth: 1, borderStyle: 'dashed', borderRadius: 18, alignItems: 'center', gap: 15 }, card: { padding: 18, borderRadius: 18, borderWidth: 1, marginBottom: 14 }, cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 }, goalIcon: { height: 42, width: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' }, track: { height: 6, borderRadius: 4, marginTop: 20, overflow: 'hidden' }, cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
});
