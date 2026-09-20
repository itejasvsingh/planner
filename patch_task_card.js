const fs = require('fs');

const code = `import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Clock, AlertCircle } from 'lucide-react-native';
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
  const overdue = !!item.dueDate && item.dueDate < today;
  const prio = prioLabel(item.priority);
  const subsTotal = item.subtasks?.length || 0;
  const subsDone = item.subtasks?.filter((s) => s.done).length || 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={\`Edit \${item.title}\`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { 
          backgroundColor: theme.backgroundElement, 
          flex: compact ? 1 : undefined, 
          marginBottom: isSwipable ? 0 : 12,
          shadowColor: theme.isDark ? '#000' : '#8A92A6',
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }]
        }
      ]}>
      <Pressable 
        accessibilityRole="checkbox" 
        accessibilityState={{ checked: item.done }} 
        onPress={onToggle} 
        style={({ pressed }) => [
          styles.check, 
          { 
            borderColor: item.done ? theme.blue : theme.textSecondary,
            backgroundColor: item.done ? theme.blue : 'transparent',
            opacity: pressed ? 0.6 : 1
          }
        ]}
      >
        {item.done && <Check color="#fff" size={14} strokeWidth={3} />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[
          styles.taskTitle, 
          { 
            color: item.done ? theme.textSecondary : theme.text,
            textDecorationLine: item.done ? 'line-through' : 'none'
          }
        ]}>
          {item.title}
        </Text>
        
        {(item.time || prio || overdue || subsTotal > 0) && (
          <View style={styles.metaRow}>
            {item.time && (
              <View style={[styles.pillLayout, { backgroundColor: theme.background }]}>
                <Clock color={theme.textSecondary} size={12} />
                <Text style={[styles.pillText, { color: theme.textSecondary }]}>{item.time}</Text>
              </View>
            )}
            {prio && (
              <View style={[styles.pillLayout, { backgroundColor: prio === 'High' ? theme.red + '20' : theme.background }]}>
                <Text style={[styles.pillText, { color: prio === 'High' ? theme.red : theme.textSecondary }]}>{prio}</Text>
              </View>
            )}
            {overdue && !item.done && (
              <View style={[styles.pillLayout, { backgroundColor: theme.red + '20' }]}>
                <AlertCircle color={theme.red} size={12} />
                <Text style={[styles.pillText, { color: theme.red }]}>Overdue</Text>
              </View>
            )}
            {subsTotal > 0 && (
              <View style={[styles.pillLayout, { backgroundColor: theme.background }]}>
                <Text style={[styles.pillText, { color: theme.textSecondary }]}>{subsDone}/{subsTotal}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    gap: 14,
  },
  check: { 
    width: 26, 
    height: 26, 
    borderRadius: 13, 
    borderWidth: 2.5, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  taskTitle: { 
    fontSize: 16, 
    fontWeight: '600',
    lineHeight: 22,
  },
  metaRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 6, 
    marginTop: 8 
  },
  pillLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  pillText: { 
    fontSize: 12, 
    fontWeight: '600' 
  },
});
`;
fs.writeFileSync('align-native/src/components/TaskCard.tsx', code);
