import { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, Alert, Linking, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingDown, TrendingUp, Users, Menu, Edit3, Repeat, ChevronRight, RotateCcw, Plus } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems, useBudgetLimits } from '@/lib/use-planner-items';
import SplitEditorModal from '@/components/SplitEditorModal';
import DrawerMenuModal from '@/components/DrawerMenuModal';
import ItemModal from '@/components/ItemModal';
import { PlannerItem } from '@/lib/planner-item';
import { triggerHaptic } from '@/lib/haptics';

function getBudgetColor(spent: number, limit: number): string {
  const pct = limit > 0 ? spent / limit : 0;
  if (pct > 0.95) return '#FF3B30';
  if (pct > 0.8) return '#FF9500';
  return '#34C759';
}

export default function FinanceScreen() {
  const theme = useTheme();
  const { phone } = usePhone();
  const { items, settleUpWith } = usePlannerItems(phone);
  const { budgetLimits, saveBudgets, DEFAULT_BUDGET_LIMITS } = useBudgetLimits(phone);

  const [financeView, setFinanceView] = useState<'transactions' | 'insights' | 'balances'>('transactions');
  const [splitExpense, setSplitExpense] = useState<PlannerItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [tempBudgets, setTempBudgets] = useState<Record<string, number>>({});
  const [newCatName, setNewCatName] = useState('');

  const allTransactions = useMemo(() => {
    return items
      .filter(i => i.type === 'expense' || i.type === 'income')
      .sort((a, b) => new Date(b.date || b.dueDate || 0).getTime() - new Date(a.date || a.dueDate || 0).getTime());
  }, [items]);

  const { monthExp, monthInc, dayExp, dayInc, categorySpend, todayTransactions, olderTransactions } = useMemo(() => {
    const monthPrefix = new Date().toISOString().substring(0, 7);
    const todayStr = new Date().toISOString().split('T')[0];

    let mExp = 0, mInc = 0, dExp = 0, dInc = 0;
    const catSpend: Record<string, number> = {};
    const today: PlannerItem[] = [];
    const older: PlannerItem[] = [];

    allTransactions.forEach(item => {
      const d = item.date || item.dueDate || '';
      const amt = parseFloat(String(item.amount)) || 0;
      
      if (d.startsWith(monthPrefix)) {
        if (item.type === 'expense') {
          mExp += amt;
          const tag = item.category || (item.tags?.[0]) || '#General';
          catSpend[tag] = (catSpend[tag] || 0) + amt;
        }
        if (item.type === 'income') mInc += amt;
      }
      
      if (d === todayStr) {
        if (item.type === 'expense') dExp += amt;
        if (item.type === 'income') dInc += amt;
        today.push(item);
      } else {
        older.push(item);
      }
    });

    return { monthExp: mExp, monthInc: mInc, dayExp: dExp, dayInc: dInc, categorySpend: catSpend, todayTransactions: today, olderTransactions: older };
  }, [allTransactions]);

  const monthlyLimit = budgetLimits['MONTHLY'] ?? 20000;
  const dailyLimit = budgetLimits['DAILY'] ?? 1000;
  const monthlyRemaining = monthlyLimit - monthExp;
  const dailyRemaining = dailyLimit - dayExp;

  const friendsBalances = useMemo(() => {
    const balances: Record<string, { amount: number, recentTitle: string }> = {};
    items.forEach(exp => {
      if (exp.type === 'expense' && exp.splits) {
        exp.splits.forEach(s => {
          if (!s.settled && s.name && s.name !== 'Me') {
            if (!balances[s.name]) balances[s.name] = { amount: 0, recentTitle: exp.title || '' };
            balances[s.name].amount += (s.amount || 0);
          }
        });
      }
    });
    return Object.entries(balances)
      .map(([name, data]) => ({ name, amount: data.amount, recentTitle: data.recentTitle }))
      .filter(b => b.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [items]);

  const recurringBills = useMemo(() => {
    const bills = items.filter(i => i.type === 'expense' && i.isRecurring);
    const unique: Record<string, PlannerItem> = {};
    bills.forEach(b => {
      const key = (b.title || '').toLowerCase();
      if (!unique[key]) unique[key] = b;
    });
    return Object.values(unique);
  }, [items]);

  const totalMonthlyCommitments = useMemo(() => 
    recurringBills.reduce((acc, b) => acc + (parseFloat(String(b.amount)) || 0), 0)
  , [recurringBills]);

  const financeMonths = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const prefix = d.toISOString().substring(0, 7);
      const label = d.toLocaleString('default', { month: 'short' });
      let exp = 0, inc = 0;
      allTransactions.forEach(t => {
        const td = t.date || t.dueDate || '';
        if (td.startsWith(prefix)) {
          if (t.type === 'expense') exp += parseFloat(String(t.amount)) || 0;
          if (t.type === 'income') inc += parseFloat(String(t.amount)) || 0;
        }
      });
      months.push({ key: prefix, label, expense: exp, income: inc });
    }
    return months;
  }, [allTransactions]);

  const financeMaxValue = Math.max(...financeMonths.flatMap(m => [m.expense, m.income]), 1);

  const openBudgetModal = () => {
    const merged = { ...budgetLimits };
    Object.keys(categorySpend).forEach(cat => {
      if (!(cat in merged)) merged[cat] = 5000;
    });
    setTempBudgets(merged);
    setNewCatName('');
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudgets = () => {
    saveBudgets(tempBudgets);
    setIsBudgetModalOpen(false);
  };

  const addCategoryToBudget = () => {
    if (!newCatName.trim()) return;
    const cat = newCatName.startsWith('#') ? newCatName : `#${newCatName}`;
    setTempBudgets(prev => ({ ...prev, [cat]: 5000 }));
    setNewCatName('');
  };

  const handleSettleUp = (name: string, amount: number) => {
    Alert.alert(
      'Settle Up',
      `Mark ₹${Math.round(amount)} from ${name} as settled?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settle', style: 'default', onPress: () => settleUpWith(name) }
      ]
    );
  };

  const handleNudge = (name: string, amount: number, recentTitle: string) => {
    const text = `Hey ${name}! Just a quick reminder from Align: you owe ₹${Math.round(amount)} for ${recentTitle}. 🍕`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const renderTransactionRow = (exp: PlannerItem) => (
    <Pressable key={exp.id} style={[styles.itemCard, { backgroundColor: theme.backgroundElement }]} onPress={() => setSplitExpense(exp)}>
      <View style={[styles.iconBox, { backgroundColor: exp.type === 'expense' ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)' }]}>
        {exp.type === 'expense' ? <TrendingDown color="#FF3B30" size={20} /> : <TrendingUp color="#34C759" size={20} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>{exp.title}</Text>
        <Text style={[styles.itemSub, { color: theme.textSecondary }]}>{(exp.category || exp.tags?.[0]) || '#General'} • {exp.date || exp.dueDate}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.amount, { color: exp.type === 'income' ? '#34C759' : theme.text }]}>
          {exp.type === 'expense' ? '-' : '+'}₹{exp.amount}
        </Text>
        {exp.splits && exp.splits.length > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Users color="#007AFF" size={12} />
            <Text style={{ color: '#007AFF', fontSize: 12, fontWeight: '600' }}>
              {exp.splits.length} split
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => setIsDrawerOpen(true)} style={{ padding: 4, marginRight: 12 }}>
          <Menu color={theme.text} size={28} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Finance</Text>
        </View>
        <Pressable onPress={openBudgetModal} style={{ padding: 4 }}>
          <Edit3 color={theme.text} size={24} />
        </Pressable>
      </View>

      <View style={styles.segmentContainer}>
        {(['transactions', 'insights', 'balances'] as const).map(tab => (
          <Pressable 
            key={tab} 
            onPress={() => { triggerHaptic('light'); setFinanceView(tab); }}
            style={[styles.segmentBtn, financeView === tab && { backgroundColor: '#007AFF' }]}
          >
            <Text style={[styles.segmentText, financeView === tab ? { color: '#FFF', fontWeight: '600' } : { color: theme.textSecondary }]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        
        {financeView === 'transactions' && (
          <>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <Pressable style={[styles.budgetCard, { backgroundColor: theme.backgroundElement }]} onPress={openBudgetModal}>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>TODAY AVAILABLE</Text>
                <Text style={{ color: dailyRemaining < 0 ? '#FF3B30' : theme.text, fontSize: 24, fontWeight: '800', marginVertical: 4 }}>
                  ₹{dailyRemaining}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Spent: ₹{dayExp} • Rx: ₹{dayInc}</Text>
              </Pressable>
              <Pressable style={[styles.budgetCard, { backgroundColor: theme.backgroundElement }]} onPress={openBudgetModal}>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>MONTH AVAILABLE</Text>
                <Text style={{ color: monthlyRemaining < 0 ? '#FF3B30' : theme.text, fontSize: 24, fontWeight: '800', marginVertical: 4 }}>
                  ₹{monthlyRemaining}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Spent: ₹{monthExp} • Rx: ₹{monthInc}</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Today's Activity</Text>
            {todayTransactions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ color: theme.textSecondary, marginBottom: 12 }}>No transactions today</Text>
                <Pressable style={[styles.logBtn, { backgroundColor: '#007AFF' }]} onPress={() => setIsItemModalOpen(true)}>
                  <Text style={{ color: '#FFF', fontWeight: '600' }}>Log Expense</Text>
                </Pressable>
              </View>
            ) : (
              todayTransactions.map(renderTransactionRow)
            )}

            <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 24 }]}>Earlier Activity</Text>
            {olderTransactions.map(renderTransactionRow)}
          </>
        )}

        {financeView === 'insights' && (
          <>
            <View style={[styles.insightHero, { backgroundColor: theme.backgroundElement }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: '600', textTransform: 'uppercase' }}>Net This Month</Text>
              <Text style={{ color: theme.text, fontSize: 44, fontWeight: '800', marginVertical: 8 }}>
                {monthExp - monthInc > 0 ? '-' : '+'}₹{Math.abs(monthExp - monthInc)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text style={{ color: '#FF3B30', fontWeight: '600' }}>Spent: ₹{monthExp}</Text>
                <Text style={{ color: '#34C759', fontWeight: '600' }}>Received: ₹{monthInc}</Text>
              </View>
            </View>

            <View style={[styles.chartCard, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.cardTitle, { color: theme.textSecondary, marginBottom: 16 }]}>Monthly Flow</Text>
              <View style={styles.chartArea}>
                {financeMonths.map(m => (
                  <View key={m.key} style={styles.chartCol}>
                    <View style={styles.barsArea}>
                      {m.income > 0 && <View style={[styles.chartBar, { backgroundColor: '#34C759', height: `${(m.income / financeMaxValue) * 100}%` }]} />}
                      {m.expense > 0 && <View style={[styles.chartBar, { backgroundColor: '#FF3B30', height: `${(m.expense / financeMaxValue) * 100}%` }]} />}
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 8 }}>{m.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.billsCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>Upcoming Bills & Subscriptions</Text>
                <Text style={{ color: theme.text, fontWeight: '700' }}>Total: ₹{totalMonthlyCommitments}</Text>
              </View>
              {recurringBills.length === 0 ? (
                <Text style={{ color: theme.textSecondary }}>No recurring bills detected.</Text>
              ) : (
                recurringBills.map((b, i) => (
                  <View key={i} style={styles.billRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <Repeat color={theme.textSecondary} size={16} style={{ marginRight: 8 }} />
                      <Text style={{ color: theme.text, fontWeight: '600', fontSize: 16 }}>{b.title}</Text>
                    </View>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>₹{b.amount}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={[styles.chartCard, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.cardTitle, { color: theme.textSecondary, marginBottom: 16 }]}>Category Budgets</Text>
              {Object.entries(budgetLimits).filter(([k]) => k.startsWith('#')).map(([cat, limit]) => {
                const spent = categorySpend[cat] || 0;
                const ratio = Math.min(spent / (limit || 1), 1);
                return (
                  <Pressable key={cat} style={{ marginBottom: 16 }} onPress={openBudgetModal}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: theme.text, fontWeight: '600' }}>{cat}</Text>
                      <Text style={{ color: theme.textSecondary }}>₹{spent} / ₹{limit}</Text>
                    </View>
                    <View style={[styles.progressBg, { backgroundColor: theme.border }]}>
                      <View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: getBudgetColor(spent, limit) }]} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {financeView === 'balances' && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginBottom: 12 }]}>Who owes you</Text>
            {friendsBalances.length === 0 ? (
              <View style={[styles.emptyBox, { paddingVertical: 60 }]}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600' }}>You're all settled up!</Text>
                <Text style={{ color: theme.textSecondary, marginTop: 8 }}>No outstanding balances.</Text>
              </View>
            ) : (
              friendsBalances.map(b => (
                <View key={b.name} style={[styles.balanceCard, { backgroundColor: theme.backgroundElement }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <View style={styles.avatar}>
                      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 18 }}>{b.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{b.name}</Text>
                      <Text style={{ color: '#FF3B30', fontSize: 15, marginTop: 2 }}>Owes you ₹{Math.round(b.amount)}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: 'rgba(0,122,255,0.1)' }]} onPress={() => handleNudge(b.name, b.amount, b.recentTitle)}>
                      <Text style={{ color: '#007AFF', fontWeight: '600' }}>Nudge 💬</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#34C759' }]} onPress={() => handleSettleUp(b.name, b.amount)}>
                      <Text style={{ color: '#FFF', fontWeight: '600' }}>Settle Up</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
            <Text style={{ textAlign: 'center', color: theme.textSecondary, marginTop: 24 }}>To add a split, tap an expense in Transactions.</Text>
          </>
        )}

      </ScrollView>

      {financeView === 'transactions' && (
        <Pressable style={[styles.fab, { backgroundColor: '#007AFF' }]} onPress={() => setIsItemModalOpen(true)}>
          <Plus color="#FFF" size={28} />
        </Pressable>
      )}

      {/* MODALS */}
      <SplitEditorModal visible={!!splitExpense} onClose={() => setSplitExpense(null)} expense={splitExpense} />
      <ItemModal visible={isItemModalOpen} onClose={() => setIsItemModalOpen(false)} initialItem={{ type: 'expense' } as any} />
      <DrawerMenuModal visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

      {/* BUDGET MODAL */}
      <Modal visible={isBudgetModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsBudgetModalOpen(false)}>
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Budgets</Text>
            <Pressable onPress={() => setIsBudgetModalOpen(false)}>
              <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginBottom: 12 }]}>Global Limits</Text>
            <View style={[styles.budgetInputRow, { borderBottomColor: theme.border }]}>
              <Text style={{ color: theme.text, flex: 1, fontSize: 16 }}>Monthly Limit</Text>
              <Text style={{ color: theme.textSecondary }}>₹</Text>
              <TextInput 
                style={[styles.budgetInput, { color: theme.text }]} 
                keyboardType="numeric" 
                value={String(tempBudgets.MONTHLY || '')}
                onChangeText={v => setTempBudgets(p => ({ ...p, MONTHLY: parseFloat(v) || 0 }))}
              />
            </View>
            <View style={[styles.budgetInputRow, { borderBottomColor: theme.border }]}>
              <Text style={{ color: theme.text, flex: 1, fontSize: 16 }}>Daily Limit</Text>
              <Text style={{ color: theme.textSecondary }}>₹</Text>
              <TextInput 
                style={[styles.budgetInput, { color: theme.text }]} 
                keyboardType="numeric" 
                value={String(tempBudgets.DAILY || '')}
                onChangeText={v => setTempBudgets(p => ({ ...p, DAILY: parseFloat(v) || 0 }))}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 24, marginBottom: 12 }]}>Category Limits</Text>
            {Object.keys(tempBudgets).filter(k => k.startsWith('#')).map(cat => (
              <View key={cat} style={[styles.budgetInputRow, { borderBottomColor: theme.border }]}>
                <Text style={{ color: theme.text, flex: 1, fontSize: 16 }}>{cat}</Text>
                <Text style={{ color: theme.textSecondary }}>₹</Text>
                <TextInput 
                  style={[styles.budgetInput, { color: theme.text }]} 
                  keyboardType="numeric" 
                  value={String(tempBudgets[cat] || '')}
                  onChangeText={v => setTempBudgets(p => ({ ...p, [cat]: parseFloat(v) || 0 }))}
                />
              </View>
            ))}

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12 }}>
              <TextInput 
                style={[styles.newCatInput, { backgroundColor: theme.background, color: theme.text, flex: 1 }]}
                placeholder="#CategoryName"
                placeholderTextColor={theme.textSecondary}
                value={newCatName}
                onChangeText={setNewCatName}
              />
              <Pressable style={[styles.addBtn, { backgroundColor: theme.text }]} onPress={addCategoryToBudget}>
                <Text style={{ color: theme.backgroundElement, fontWeight: '600' }}>Add</Text>
              </Pressable>
            </View>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#007AFF' }]} onPress={handleSaveBudgets}>
              <Text style={{ color: '#FFF', fontSize: 17, fontWeight: '600' }}>Save Limits</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  segmentContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 8 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 14, fontWeight: '500' },
  list: { paddingHorizontal: 20, paddingBottom: 160, gap: 12 },
  budgetCard: { flex: 1, padding: 16, borderRadius: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  itemCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 8 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  itemTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  itemSub: { fontSize: 13, marginTop: 2 },
  amount: { fontSize: 17, fontWeight: '700' },
  emptyBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  logBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  fab: { position: 'absolute', bottom: 90, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  
  insightHero: { padding: 24, borderRadius: 20, alignItems: 'center', marginBottom: 16 },
  chartCard: { padding: 20, borderRadius: 20, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  chartArea: { flexDirection: 'row', justifyContent: 'space-between', height: 160, alignItems: 'flex-end', paddingTop: 20 },
  chartCol: { alignItems: 'center', width: '15%' },
  barsArea: { flexDirection: 'row', height: '100%', alignItems: 'flex-end', gap: 4, flex: 1 },
  chartBar: { width: 8, borderRadius: 4, minHeight: 4 },
  billsCard: { padding: 20, borderRadius: 20, marginBottom: 16 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  progressBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },

  balanceCard: { padding: 20, borderRadius: 20, marginBottom: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  
  modalSafe: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  budgetInput: { width: 80, fontSize: 18, fontWeight: '600', textAlign: 'right' },
  newCatInput: { padding: 12, borderRadius: 8, fontSize: 16 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  saveBtn: { marginTop: 32, paddingVertical: 16, borderRadius: 12, alignItems: 'center' }
});
