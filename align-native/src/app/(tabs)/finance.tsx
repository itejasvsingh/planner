import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingDown, Users, Menu, Plus } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems, useBudgetLimits } from '@/lib/use-planner-items';
import SplitEditorModal from '@/components/SplitEditorModal';
import DrawerMenuModal from '@/components/DrawerMenuModal';
import ItemModal from '@/components/ItemModal';
import { PlannerItem } from '@/lib/planner-item';

export default function FinanceScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, settleUpWith } = usePlannerItems(phone);
  const { budgetLimits } = useBudgetLimits(phone);

  const [splitExpense, setSplitExpense] = useState<PlannerItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);

  const expenses = useMemo(() => items.filter(i => i.type === 'expense'), [items]);
  const totalSpent = expenses.reduce((acc, exp) => acc + (parseFloat(exp.amount as string) || 0), 0);
  
  const categoryTotals = useMemo(() => {
    const cats: Record<string, number> = {};
    expenses.forEach(exp => {
      const cat = exp.category || '#General';
      cats[cat] = (cats[cat] || 0) + (parseFloat(exp.amount as string) || 0);
    });
    return cats;
  }, [expenses]);

  const balances = useMemo(() => {
    const owesMe: Record<string, number> = {};
    expenses.forEach(exp => {
      if (exp.splits) {
        exp.splits.forEach(s => {
          if (!s.settled && s.name !== 'Me') {
            owesMe[s.name] = (owesMe[s.name] || 0) + (s.amount || 0);
          }
        });
      }
    });
    return owesMe;
  }, [expenses]);

  const handleSettleUp = (name: string, amount: number) => {
    Alert.alert(
      'Settle Up',
      `Mark ₹${amount} from ${name} as settled?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settle', style: 'default', onPress: () => settleUpWith(name) }
      ]
    );
  };

  const getBarColor = (spent: number, limit: number) => {
    const ratio = spent / (limit || 1);
    if (ratio >= 0.95) return theme.red;
    if (ratio >= 0.80) return theme.orange;
    return theme.green;
  };

  const renderProgressBar = (spent: number, limit: number) => {
    const ratio = Math.min(spent / (limit || 1), 1);
    return (
      <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
        <View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: getBarColor(spent, limit) }]} />
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => setIsDrawerOpen(true)} style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.7 : 1, marginRight: 12 }]}>
          <Menu color={theme.text} size={28} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Finance</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>Monthly Spend</Text>
          <Text style={[styles.summaryTotal, { color: theme.text }]}>₹{totalSpent.toLocaleString('en-IN')}</Text>
          <View style={{ marginTop: 12 }}>
            <View style={styles.budgetRow}>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>0</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>Limit: ₹{budgetLimits?.MONTHLY || 0}</Text>
            </View>
            {renderProgressBar(totalSpent, budgetLimits?.MONTHLY || 1)}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary, marginBottom: 12 }]}>Category Breakdown</Text>
          {Object.keys(categoryTotals).length === 0 ? (
            <Text style={{ color: theme.textSecondary }}>No category spend yet.</Text>
          ) : (
            Object.entries(categoryTotals).map(([cat, amount]) => (
              <View key={cat} style={{ marginBottom: 12 }}>
                <View style={styles.budgetRow}>
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{cat}</Text>
                  <Text style={{ color: theme.textSecondary }}>₹{amount} / ₹{budgetLimits?.[cat] || 0}</Text>
                </View>
                {renderProgressBar(amount, budgetLimits?.[cat] || amount)}
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.cardTitle, { color: theme.textSecondary, marginBottom: 12 }]}>Friends Balances</Text>
          {Object.keys(balances).length === 0 ? (
            <Text style={{ color: theme.textSecondary }}>All settled up!</Text>
          ) : (
            Object.entries(balances).map(([name, amount]) => (
              <View key={name} style={[styles.balanceRow, { borderBottomColor: theme.border }]}>
                <View>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>{name}</Text>
                  <Text style={{ color: theme.red, fontSize: 14 }}>Owes you ₹{amount}</Text>
                </View>
                <Pressable 
                  onPress={() => handleSettleUp(name, amount)}
                  style={[styles.settleBtn, { backgroundColor: theme.green }]}
                >
                  <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 14 }}>Settle</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 12 }]}>Recent Expenses</Text>
        {expenses.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>No expenses yet. Tap + to add one.</Text>
        ) : (
          expenses.map(exp => (
            <Pressable key={exp.id} style={[styles.itemCard, { backgroundColor: theme.backgroundElement }]} onPress={() => setSplitExpense(exp)}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(255,59,48,0.1)' }]}>
                <TrendingDown color="#FF3B30" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: theme.text }]}>{exp.title}</Text>
                <Text style={[styles.itemSub, { color: theme.textSecondary }]}>{exp.category || '#General'} • {exp.date}</Text>
              </View>
              
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.amount, { color: theme.text }]}>₹{exp.amount}</Text>
                {exp.splits && exp.splits.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Users color={theme.blue} size={12} />
                    <Text style={{ color: theme.blue, fontSize: 12, fontWeight: '600' }}>
                      {exp.splits.length} split
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable 
        style={[styles.fab, { backgroundColor: theme.blue }]}
        onPress={() => setIsItemModalOpen(true)}
      >
        <Plus color="#FFF" size={28} />
      </Pressable>

      <SplitEditorModal 
        visible={!!splitExpense} 
        onClose={() => setSplitExpense(null)} 
        expense={splitExpense} 
      />
      <ItemModal
        visible={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        defaultTab="expense"
      />
      <DrawerMenuModal visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
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
  card: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryTotal: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 8,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
    marginBottom: -4,
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
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  }
});
