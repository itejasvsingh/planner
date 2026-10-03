import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Check, Clock, AlertCircle, Bell, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import { type PlannerItem } from '@/lib/planner-item';
import { Colors, Radius, Shadow, Type } from '@/constants/theme';

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
  hideTime,
}: {
  item: PlannerItem;
  theme: any;
  today: string;
  compact?: boolean;
  onToggle: () => void;
  onPress: () => void;
  isSwipable?: boolean;
  /** Set when the parent already shows the time next to the card. */
  hideTime?: boolean;
}) {
  const overdue = !!item.dueDate && item.dueDate < today;
  const prio = prioLabel(item.priority);
  const subsTotal = item.subtasks?.length || 0;
  const subsDone = item.subtasks?.filter((s) => s.done).length || 0;

  const isDark = theme.isDark;
  const c = isDark ? Colors.dark : Colors.light;

  const isIncome = item.type === 'income' || item.type === 'deposit';
  const isExpense = item.type === 'expense';
  const isTask = item.type === 'task' || !item.type;
  const showTime = !!item.dueTime && !hideTime;

  // Tasks lead with their checkbox; money and reminder items lead with a type icon.
  let Icon = Bell;
  let iconColor: string = c.warning;
  let iconBg: string = c.warningSoft;
  if (isExpense) {
    Icon = ArrowUpRight;
    iconColor = c.expense;
    iconBg = c.expenseSoft;
  } else if (isIncome) {
    Icon = ArrowDownLeft;
    iconColor = c.income;
    iconBg = c.incomeSoft;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.backgroundElement,
          borderColor: c.border,
          flex: compact ? 1 : undefined,
          marginBottom: isSwipable ? 0 : 0,
          opacity: pressed ? 0.85 : 1,
        },
        Shadow.card,
      ]}>

      {isTask ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.done }}
          hitSlop={8}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.check,
            {
              borderColor: item.done ? c.accentFill : c.textTertiary,
              backgroundColor: item.done ? c.accentFill : 'transparent',
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          {item.done && <Check color={c.onAccent} size={14} strokeWidth={3} />}
        </Pressable>
      ) : (
        <View style={[styles.iconChip, { backgroundColor: iconBg }]}>
          <Icon color={iconColor} size={18} />
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text
          style={[
            Type.body,
            {
              color: item.done ? c.textTertiary : c.text,
              fontWeight: '600',
              textDecorationLine: item.done ? 'line-through' : 'none',
            },
          ]}
        >
          {item.title}
        </Text>

        {(showTime || prio || (overdue && !item.done) || subsTotal > 0) && (
          <View style={styles.metaRow}>
            {showTime && (
              <View style={[styles.pill, { backgroundColor: c.backgroundMuted }]}>
                <Clock color={c.textSecondary} size={11} />
                <Text style={[styles.pillText, { color: c.textSecondary }]}>{item.dueTime}</Text>
              </View>
            )}
            {prio && (
              <View style={[styles.pill, { backgroundColor: prio === 'High' ? c.expenseSoft : c.backgroundMuted }]}>
                <Text style={[styles.pillText, { color: prio === 'High' ? c.expense : c.textSecondary }]}>{prio}</Text>
              </View>
            )}
            {overdue && !item.done && (
              <View style={[styles.pill, { backgroundColor: c.expenseSoft }]}>
                <AlertCircle color={c.expense} size={11} />
                <Text style={[styles.pillText, { color: c.expense }]}>Overdue</Text>
              </View>
            )}
            {subsTotal > 0 && (
              <View style={[styles.pill, { backgroundColor: c.backgroundMuted }]}>
                <Text style={[styles.pillText, { color: c.textSecondary }]}>{subsDone}/{subsTotal} subtasks</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {!!item.amount && (
        <Text
          style={[
            Type.body,
            { color: isExpense ? c.text : c.income, fontVariant: ['tabular-nums'], fontWeight: '700' },
          ]}
        >
          {isExpense ? '−' : '+'}₹{Number(item.amount).toLocaleString('en-IN')}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 7,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    gap: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
