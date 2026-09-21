import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, ShoppingBag, Coffee, Car, Home, Wallet, TrendingDown, TrendingUp } from 'lucide-react-native';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems, useBudgetLimits } from '@/lib/use-planner-items';
import { Colors, Radius, Shadow, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import SegmentedControl from '@/components/SegmentedControl';
import EditTransactionSheet from '@/components/EditTransactionSheet';

const formatMoney = (amount: number) => {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
};

function getCategoryIcon(category?: string) {
    if (!category) return Wallet;
    const cat = category.toLowerCase();
    if (cat.includes('food') || cat.includes('eat') || cat.includes('din')) return Coffee;
    if (cat.includes('shop')) return ShoppingBag;
    if (cat.includes('transport') || cat.includes('ride') || cat.includes('uber') || cat.includes('travel')) return Car;
    if (cat.includes('home') || cat.includes('rent')) return Home;
    return CreditCard;
}

export default function FinanceScreen() {
  const { phone } = usePhone();
  const theme = useTheme();
  const c = theme.isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  
  const { items, updateItem, deleteItem } = usePlannerItems(phone);
  const { budgetLimits: limits } = useBudgetLimits(phone);

  const budget = limits?.monthlyBudget || 50000;
  
  const expenses = items.filter(i => i.type === 'expense');
  const incomes = items.filter(i => i.type === 'income' || i.type === 'deposit');

  const spent = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const earned = incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  
  const available = Math.max(0, budget - spent);
  const budgetPercentage = Math.min(100, Math.max(0, (spent / budget) * 100));
  
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

  const allTransactions = useMemo(() => {
      return [...expenses, ...incomes].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [expenses, incomes]);

  const [activeTab, setActiveTab] = useState('Transactions');
  const [editingItem, setEditingItem] = useState<any>(null);

  const renderInsights = () => (
      <View style={{ gap: 24 }}>
          {/* Hero Budget Card */}
          <View style={[styles.card, { backgroundColor: c.backgroundElement }]}>
              <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Monthly Budget</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={[Type.displayLg, { color: c.text }]}>{formatMoney(spent)}</Text>
                  <Text style={[Type.body, { color: c.textTertiary }]}>/ {formatMoney(budget)}</Text>
              </View>
              
              {/* Progress Bar */}
              <View style={{ height: 12, backgroundColor: c.border, borderRadius: 6, marginTop: 16, overflow: 'hidden' }}>
                  <View style={{ width: `${budgetPercentage}%`, height: '100%', backgroundColor: budgetPercentage > 90 ? c.expense : c.accent, borderRadius: 6 }} />
              </View>
              <Text style={[Type.caption, { color: c.textTertiary, marginTop: 8 }]}>
                  {budgetPercentage > 100 ? "You've exceeded your budget" : `${formatMoney(available)} left for this month`}
              </Text>
          </View>

          {/* Category Breakdown */}
          <View>
              <Text style={[Type.title, { color: c.text, marginBottom: 16 }]}>Top Spending Categories</Text>
              <View style={{ gap: 12 }}>
                  {categoryTotals.map(cat => (
                      <View key={cat.name} style={[styles.rowItem, { backgroundColor: c.backgroundElement }]}>
                          <View style={[styles.iconBox, { backgroundColor: c.accentSoft }]}>
                              <cat.icon color={c.accent} size={20} />
                          </View>
                          <View style={{ flex: 1 }}>
                              <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>{cat.name}</Text>
                              <View style={{ width: '100%', height: 4, backgroundColor: c.border, borderRadius: 2, marginTop: 6 }}>
                                  <View style={{ width: `${Math.min(100, (cat.amount / Math.max(spent, 1)) * 100)}%`, height: '100%', backgroundColor: c.accent, borderRadius: 2 }} />
                              </View>
                          </View>
                          <Text style={[Type.body, { color: c.text, fontWeight: '700' }]}>{formatMoney(cat.amount)}</Text>
                      </View>
                  ))}
                  {categoryTotals.length === 0 && (
                      <Text style={[Type.body, { color: c.textTertiary, textAlign: 'center', marginVertical: 20 }]}>No expenses logged yet.</Text>
                  )}
              </View>
          </View>
      </View>
  );

  const renderTransactions = () => (
      <View style={{ gap: 12 }}>
          {allTransactions.map(item => {
              const isIncome = item.type === 'income' || item.type === 'deposit';
              const Icon = isIncome ? TrendingUp : TrendingDown;
              const color = isIncome ? c.income : c.text;
              return (
                  <Pressable 
                      key={item.id} 
                      onPress={() => setEditingItem(item)}
                      style={({ pressed }) => [
                          styles.transactionItem, 
                          { backgroundColor: c.backgroundElement, opacity: pressed ? 0.7 : 1 }
                      ]}
                  >
                      <View style={[styles.iconBox, { backgroundColor: isIncome ? c.incomeSoft : c.border }]}>
                          <Icon color={isIncome ? c.income : c.textSecondary} size={20} />
                      </View>
                      <View style={{ flex: 1 }}>
                          <Text style={[Type.body, { color: c.text, fontWeight: '600' }]} numberOfLines={1}>{item.title}</Text>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 }}>
                              <Text style={[Type.caption, { color: c.textTertiary }]}>{item.date}</Text>
                              {item.category && (
                                  <>
                                      <Text style={[Type.caption, { color: c.textTertiary }]}>•</Text>
                                      <Text style={[Type.caption, { color: c.textSecondary }]}>{item.category}</Text>
                                  </>
                              )}
                          </View>
                      </View>
                      <Text style={[Type.body, { color, fontWeight: '700' }]}>
                          {isIncome ? '+' : '-'}{formatMoney(Number(item.amount) || 0)}
                      </Text>
                  </Pressable>
              );
          })}
          {allTransactions.length === 0 && (
              <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={[Type.body, { color: c.textTertiary }]}>No transactions found.</Text>
              </View>
          )}
      </View>
  );

  return (
    <>
        <ScrollView 
            style={{ flex: 1, backgroundColor: c.background }} 
            contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 120, paddingHorizontal: 20 }}
            showsVerticalScrollIndicator={false}
        >
            <Text style={[Type.displayLg, { color: c.text, marginBottom: 24, marginTop: 10 }]}>Finance</Text>
            
            <SegmentedControl 
                tabs={['Transactions', 'Insights']} 
                activeTab={activeTab} 
                onTabChange={setActiveTab} 
            />

            {activeTab === 'Insights' ? renderInsights() : renderTransactions()}

        </ScrollView>

        <EditTransactionSheet 
            visible={!!editingItem} 
            item={editingItem} 
            onClose={() => setEditingItem(null)} 
            onSave={async (updates) => {
                if (editingItem) await updateItem(editingItem.id, updates);
            }}
            onDelete={async (id) => {
                await deleteItem(id);
            }}
        />
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 24, borderRadius: 24 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 20 },
  transactionItem: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 20 },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
