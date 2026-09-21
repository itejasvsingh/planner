import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, ShoppingBag, Coffee, Car, Home, DollarSign, Wallet } from 'lucide-react-native';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems, useBudgetLimits } from '@/lib/use-planner-items';
import { Colors, Radius, Shadow, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import TaskCard from '@/components/TaskCard';

const formatMoney = (amount: number) => {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
};

function getCategoryIcon(category?: string) {
    if (!category) return Wallet;
    const cat = category.toLowerCase();
    if (cat.includes('food') || cat.includes('eat')) return Coffee;
    if (cat.includes('shop')) return ShoppingBag;
    if (cat.includes('transport') || cat.includes('ride') || cat.includes('uber')) return Car;
    if (cat.includes('home') || cat.includes('rent')) return Home;
    return CreditCard;
}

export default function FinanceScreen() {
  const { phone } = usePhone();
  const theme = useTheme();
  const c = theme.isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  
  const { items } = usePlannerItems(phone);
  const { limits } = useBudgetLimits(phone);

  const budget = limits?.monthlyBudget || 50000;
  
  const expenses = items.filter(i => i.type === 'expense');
  const incomes = items.filter(i => i.type === 'income' || i.type === 'deposit');

  const spent = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const earned = incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  
  const available = Math.max(0, budget - spent);
  
  const categoryTotals = useMemo(() => {
      const totals: Record<string, number> = {};
      expenses.forEach(e => {
          const cat = e.category || 'Other';
          totals[cat] = (totals[cat] || 0) + (Number(e.amount) || 0);
      });
      return Object.entries(totals)
          .map(([name, amount]) => ({ name, amount, icon: getCategoryIcon(name) }))
          .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  return (
    <ScrollView 
        style={{ flex: 1, backgroundColor: c.background }} 
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 100, paddingHorizontal: 16 }}
    >
      <View style={[styles.heroCard, { backgroundColor: c.accentSoft }, Shadow.card]}>
          <Text style={[Type.body, { color: c.accent }]}>Monthly Budget Available</Text>
          <Text style={[Type.displayLg, { color: c.accent, marginVertical: 8 }]}>{formatMoney(available)}</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
             <View>
                 <Text style={[Type.caption, { color: c.textSecondary }]}>Spent</Text>
                 <Text style={[Type.title, { color: c.expense, marginTop: 2 }]}>{formatMoney(spent)}</Text>
             </View>
             <View style={{ width: 1, backgroundColor: c.accent, opacity: 0.2 }} />
             <View>
                 <Text style={[Type.caption, { color: c.textSecondary }]}>Earned</Text>
                 <Text style={[Type.title, { color: c.income, marginTop: 2 }]}>{formatMoney(earned)}</Text>
             </View>
          </View>
      </View>

      {categoryTotals.length > 0 && (
          <View style={{ marginTop: 32 }}>
            <Text style={[Type.title, { color: c.text, marginBottom: 16 }]}>Spend by Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {categoryTotals.map(cat => (
                <View key={cat.name} style={[styles.catChip, { backgroundColor: c.backgroundElement }, Shadow.card]}>
                  <View style={[styles.iconChip, { backgroundColor: c.expenseSoft }]}>
                    <cat.icon color={c.expense} size={18} />
                  </View>
                  <View>
                    <Text style={[Type.caption, { color: c.textSecondary }]}>{cat.name}</Text>
                    <Text style={[Type.body, { color: c.text, fontWeight: '700' }]}>{formatMoney(cat.amount)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
      )}

      <View style={{ marginTop: 32 }}>
        <Text style={[Type.title, { color: c.text, marginBottom: 16 }]}>Recent Transactions</Text>
        <View style={{ gap: 12 }}>
            {[...expenses, ...incomes]
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                .slice(0, 20)
                .map(item => (
                <TaskCard 
                    key={item.id} 
                    item={item} 
                    theme={theme} 
                    today={new Date().toISOString().split('T')[0]} 
                    onToggle={() => {}}
                    onPress={() => {}} 
                />
            ))}
            
            {(expenses.length === 0 && incomes.length === 0) && (
                <View style={[styles.empty, { backgroundColor: c.backgroundElement }, Shadow.card]}>
                    <Text style={[Type.body, { color: c.textSecondary }]}>No transactions yet.</Text>
                </View>
            )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heroCard: { padding: 24, borderRadius: Radius.xl },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.lg, minWidth: '47%', flex: 1 },
  iconChip: { width: 36, height: 36, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 24, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
});
