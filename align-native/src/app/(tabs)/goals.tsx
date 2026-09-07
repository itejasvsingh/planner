import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Target, ArrowUpRight } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';

export default function GoalsScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, updateGoalProgress } = usePlannerItems(phone);

  const goals = useMemo(() => items.filter(i => i.type === 'goal'), [items]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Goals</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {goals.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>No goals yet. Use the bar below to add one.</Text>
        ) : (
          goals.map(goal => {
            const target = goal.target || 1;
            const current = goal.current || 0;
            const percent = Math.min((current / target) * 100, 100);
            
            return (
              <View key={goal.id} style={[styles.itemCard, { backgroundColor: theme.backgroundElement, flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.iconBox, { backgroundColor: 'rgba(52,199,89,0.1)' }]}>
                    <Target color="#34C759" size={20} />
                  </View>
                  <View style={{ flex: 1, paddingLeft: 12 }}>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{goal.title}</Text>
                    <Text style={[styles.itemSub, { color: theme.textSecondary }]}>{current} / {target} {goal.unit}</Text>
                  </View>
                  <Pressable 
                    style={[styles.plusBtn, { backgroundColor: theme.blue }]} 
                    onPress={() => updateGoalProgress(goal.id, current, target)}
                  >
                    <ArrowUpRight color="#FFF" size={18} />
                  </Pressable>
                </View>
                
                <View style={[styles.progressTrack, { backgroundColor: 'rgba(120,120,128,0.2)' }]}>
                  <View style={[styles.progressFill, { backgroundColor: '#34C759', width: `${percent}%` }]} />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 160,
    gap: 12,
  },
  itemCard: {
    padding: 16,
    borderRadius: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  itemSub: {
    fontSize: 13,
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  }
});

