import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Target, Plus, Check } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadow } from '@/constants/theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { type PlannerItem } from '@/lib/planner-item';
import ItemModal from '@/components/ItemModal';
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import ScreenHeader, { HeaderButton } from '@/components/ScreenHeader';

function formatAmount(value: number, unit?: string) {
  const n = value.toLocaleString('en-IN');
  if (unit === '₹') return `₹${n}`;
  return n;
}

export default function GoalsScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, loading, error, updateGoalProgress } = usePlannerItems(phone);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerItem | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const goals = items.filter(item => item.type === 'goal');
  const done = goals.filter(goal => (goal.current || 0) >= (goal.target || 1));
  const visible = goals.filter(goal => ((goal.current || 0) >= (goal.target || 1)) === showCompleted);
  function addGoal() { setEditing(null); setModalOpen(true); }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false} onScroll={collapseQuickAddOnScroll} scrollEventThrottle={16}>
        <ScreenHeader
          title="Goals"
          subtitle="Small steps. Real progress."
          actions={
            <HeaderButton label="Create goal" onPress={addGoal} filled>
              <Plus size={20} color={theme.onAccent} strokeWidth={2.5} />
            </HeaderButton>
          }
        />

        <View style={styles.content}>
          <View style={[styles.segmented, { backgroundColor: theme.backgroundMuted }]}>
            {[false, true].map(value => {
              const active = showCompleted === value;
              return (
                <Pressable
                  key={String(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setShowCompleted(value)}
                  style={[styles.segment, active && { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                >
                  <Text style={{ color: active ? theme.text : theme.textSecondary, fontSize: 13, fontWeight: active ? '700' : '500' }}>
                    {value ? 'Completed' : 'In progress'}
                    <Text style={{ color: theme.textTertiary, fontWeight: '600' }}>  {value ? done.length : goals.length - done.length}</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!!error && <Text accessibilityRole="alert" style={{ color: theme.red, marginBottom: 12 }}>{error}</Text>}

          {loading && !items.length ? (
            <ActivityIndicator color={theme.accent} />
          ) : visible.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.accentFill }]}>
                <Target size={22} color={theme.onAccent} />
              </View>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
                {showCompleted ? 'Your milestones belong here' : 'What would you like to work toward?'}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
                {showCompleted ? 'Keep going. Every small step adds up.' : 'Read 12 books, run 50 km, or build a new habit. Start with one goal.'}
              </Text>
              {!showCompleted && (
                <Pressable accessibilityRole="button" onPress={addGoal}>
                  <Text style={{ color: theme.accent, fontWeight: '700' }}>Create your first goal →</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {visible.map(goal => {
                const target = goal.target || 1;
                const current = goal.current || 0;
                const percent = Math.min(100, Math.max(0, (current / target) * 100));
                const complete = current >= target;
                const unitLabel = goal.unit && goal.unit !== '₹' ? ` ${goal.unit}` : '';
                return (
                  <View key={goal.id} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, Shadow.card]}>
                    <View style={styles.cardHeader}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${goal.title}`}
                        style={{ flex: 1 }}
                        onPress={() => { setEditing(goal); setModalOpen(true); }}
                      >
                        <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 }}>{goal.title}</Text>
                        <Text style={[styles.meta, { color: theme.textSecondary }]}>
                          {formatAmount(current, goal.unit)} of {formatAmount(target, goal.unit)}{unitLabel || (!goal.unit ? ' steps' : '')}
                        </Text>
                      </Pressable>
                      <Text style={[styles.percent, { color: complete ? theme.accent : theme.text }]}>{Math.round(percent)}%</Text>
                    </View>

                    <View
                      accessibilityRole="progressbar"
                      accessibilityLabel={goal.title}
                      accessibilityValue={{ min: 0, max: target, now: Math.min(current, target) }}
                      style={[styles.track, { backgroundColor: theme.backgroundMuted }]}
                    >
                      <View style={{ height: '100%', width: `${percent}%`, backgroundColor: theme.accentFill, borderRadius: Radius.pill }} />
                    </View>

                    <View style={styles.cardFooter}>
                      <Text style={{ color: theme.textTertiary, fontSize: 12, fontWeight: '500' }}>
                        {complete ? 'Milestone reached' : goal.date ? `Target · ${goal.date}` : `${formatAmount(target - current, goal.unit)}${unitLabel} to go`}
                      </Text>
                      {complete ? (
                        <View style={[styles.stepBtn, { backgroundColor: theme.accentSoft }]}>
                          <Check size={14} color={theme.accent} strokeWidth={3} />
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Add one ${goal.unit || 'step'} to ${goal.title}`}
                          onPress={() => void updateGoalProgress(goal.id, current, target)}
                          style={({ pressed }) => [styles.stepBtn, styles.stepBtnWide, { backgroundColor: theme.accentFill, opacity: pressed ? 0.75 : 1 }]}
                        >
                          <Plus size={14} color={theme.onAccent} strokeWidth={3} />
                          <Text style={{ color: theme.onAccent, fontSize: 12, fontWeight: '800' }}>1</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
      <ItemModal visible={modalOpen} onClose={() => setModalOpen(false)} initialItem={editing} defaultType="goal" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3, marginBottom: 14 },
  segment: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: Radius.sm + 1, borderWidth: 1, borderColor: 'transparent' },
  empty: { padding: 28, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  card: { padding: 16, borderRadius: Radius.lg, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  meta: { fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },
  percent: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: Radius.pill, marginTop: 14, overflow: 'hidden' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  stepBtn: { height: 28, minWidth: 28, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepBtnWide: { flexDirection: 'row', gap: 2, paddingHorizontal: 12 },
});
