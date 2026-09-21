const fs = require('fs');

const code = `import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Clock, AlertCircle, CheckSquare, Bell, CreditCard, DollarSign } from 'lucide-react-native';
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
}: {
  item: PlannerItem;
  theme: any;
  today: string;
  compact?: boolean;
  onToggle: () => void;
  onPress: () => void;
  isSwipable?: boolean;
}) {
  const overdue = !!item.dueDate && item.dueDate < today;
  const prio = prioLabel(item.priority);
  const subsTotal = item.subtasks?.length || 0;
  const subsDone = item.subtasks?.filter((s) => s.done).length || 0;

  const isDark = theme.isDark;
  const c = isDark ? Colors.dark : Colors.light;

  const isIncome = item.type === 'income' || item.type === 'deposit';
  const isExpense = item.type === 'expense';
  
  let IconComponent = CheckSquare;
  let iconColor = c.textTertiary;
  let iconBg = c.background;

  if (isExpense) {
    IconComponent = CreditCard;
    iconColor = c.expense;
    iconBg = c.expenseSoft;
  } else if (isIncome) {
    IconComponent = DollarSign;
    iconColor = c.income;
    iconBg = c.incomeSoft;
  } else if (item.type === 'reminder') {
    IconComponent = Bell;
    iconColor = c.warning;
    iconBg = c.warningSoft;
  } else {
    IconComponent = CheckSquare;
    iconColor = c.accent;
    iconBg = c.accentSoft;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={\`Edit \${item.title}\`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { 
          backgroundColor: c.backgroundElement, 
          flex: compact ? 1 : undefined, 
          marginBottom: isSwipable ? 0 : 12,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }]
        },
        Shadow.card
      ]}>
      
      {/* Colored chip icon */}
      <View style={[styles.iconChip, { backgroundColor: iconBg }]}>
        <IconComponent color={iconColor} size={20} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[
          Type.body,
          { 
            color: item.done ? c.textSecondary : c.text,
            fontWeight: '600',
            textDecorationLine: item.done ? 'line-through' : 'none'
          }
        ]}>
          {item.title}
        </Text>
        
        {(item.time || prio || overdue || subsTotal > 0 || item.amount) && (
          <View style={styles.metaRow}>
            {!!item.amount && (
               <Text style={[
                 Type.label, 
                 { 
                   color: isExpense ? c.expense : c.income, 
                   fontVariant: ['tabular-nums'], 
                   fontWeight: '700' 
                 }
               ]}>
                 {isExpense ? '-' : '+'}₹{item.amount}
               </Text>
            )}
            {item.time && (
              <View style={[styles.pillLayout, { backgroundColor: c.background }]}>
                <Clock color={c.textSecondary} size={12} />
                <Text style={[Type.caption, { color: c.textSecondary }]}>{item.time}</Text>
              </View>
            )}
            {prio && (
              <View style={[styles.pillLayout, { backgroundColor: prio === 'High' ? c.expenseSoft : c.background }]}>
                <Text style={[Type.caption, { color: prio === 'High' ? c.expense : c.textSecondary }]}>{prio}</Text>
              </View>
            )}
            {overdue && !item.done && (
              <View style={[styles.pillLayout, { backgroundColor: c.expenseSoft }]}>
                <AlertCircle color={c.expense} size={12} />
                <Text style={[Type.caption, { color: c.expense }]}>Overdue</Text>
              </View>
            )}
            {subsTotal > 0 && (
              <View style={[styles.pillLayout, { backgroundColor: c.background }]}>
                <Text style={[Type.caption, { color: c.textSecondary }]}>{subsDone}/{subsTotal}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      
      {item.type === 'task' || !item.type ? (
        <Pressable 
          accessibilityRole="checkbox" 
          accessibilityState={{ checked: item.done }} 
          onPress={onToggle} 
          style={({ pressed }) => [
            styles.check, 
            { 
              borderColor: item.done ? c.income : c.border,
              backgroundColor: item.done ? c.income : 'transparent',
              opacity: pressed ? 0.6 : 1
            }
          ]}
        >
          {item.done && <Check color="#fff" size={14} strokeWidth={3} />}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: Radius.lg,
    gap: 14,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { 
    width: 26, 
    height: 26, 
    borderRadius: Radius.pill, 
    borderWidth: 2, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  metaRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 6, 
    marginTop: 8,
    alignItems: 'center',
  },
  pillLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
});
`;
fs.writeFileSync('align-native/src/components/TaskCard.tsx', code);
