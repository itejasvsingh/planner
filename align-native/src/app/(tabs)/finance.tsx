import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Target, TrendingDown, ArrowUpRight } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';

export default function FinanceScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, deleteItem } = usePlannerItems(phone);

  const expenses = useMemo(() => items.filter(i => i.type === 'expense'), [items]);
  const totalSpent = expenses.reduce((acc, exp) => acc + (parseFloat(exp.amount as string) || 0), 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Finance</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={[styles.summaryCard, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total Spent</Text>
          <Text style={[styles.summaryTotal, { color: theme.text }]}>₹{totalSpent.toLocaleString('en-IN')}</Text>
        </View>

        {expenses.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>No expenses yet. Tap + to add one.</Text>
        ) : (
          expenses.map(exp => (
            <View key={exp.id} style={[styles.itemCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(255,59,48,0.1)' }]}>
                <TrendingDown color="#FF3B30" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: theme.text }]}>{exp.title}</Text>
                <Text style={[styles.itemSub, { color: theme.textSecondary }]}>{exp.category || '#General'} • {exp.date}</Text>
              </View>
              <Text style={[styles.amount, { color: theme.text }]}>₹{exp.amount}</Text>
              <Pressable onPress={() => deleteItem(exp.id)} style={styles.deleteBtn}>
                <Text style={{ color: '#FF3B30', fontSize: 12, fontWeight: '600' }}>Del</Text>
              </Pressable>
            </View>
          ))
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
    paddingBottom: 160, // space for QuickAddBar
    gap: 12,
  },
  summaryCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryTotal: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 12,
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
  amount: {
    fontSize: 17,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,59,48,0.1)',
    borderRadius: 8,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  }
});

