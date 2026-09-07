import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type PlannerItem } from '@/lib/planner-item';

function prioLabel(priority?: string) {
  if (priority === 'high') return 'High';
  if (priority === 'medium') return 'Med';
  if (priority === 'low') return 'Low';
  return null;
}

export default function TaskCard({
  item,
  theme,
  today,
  compact,
  onToggle,
  onPress,
  isSwipable,
}: {
  item: PlannerItem;
  theme: any;
  today: string;
  compact?: boolean;
  onToggle: () => void;
  onPress: () => void;
  isSwipable?: boolean;
}) {
  const overdue = (item.dueDate || '') < today;
  const prio = prioLabel(item.priority);
  const subsTotal = item.subtasks?.length || 0;
  const subsDone = item.subtasks?.filter((s) => s.done).length || 0;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, flex: compact ? 1 : undefined, marginBottom: isSwipable ? 0 : 10 },
      ]}>
      <Pressable onPress={onToggle} hitSlop={8} style={[styles.check, { borderColor: theme.border, backgroundColor: item.done ? theme.blue : 'transparent' }]} />
      <View style={{ flex: 1, opacity: item.done ? 0.6 : 1 }}>
        <Text style={[styles.taskTitle, { color: theme.text, textDecorationLine: item.done ? 'line-through' : 'none' }]}>{item.title}</Text>
        <View style={styles.metaRow}>
          {prio ? (
            <Text style={[styles.pill, { color: theme.blue, backgroundColor: theme.background }]}>{prio}</Text>
          ) : null}
          {subsTotal > 0 ? (
            <Text style={[styles.pill, { color: theme.text, backgroundColor: theme.background }]}>
              {subsDone}/{subsTotal}
            </Text>
          ) : null}
          {overdue && !item.done ? (
            <Text style={[styles.pill, { color: theme.red, backgroundColor: theme.background }]}>Overdue</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, marginTop: 2 },
  taskTitle: { fontSize: 17, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
});

