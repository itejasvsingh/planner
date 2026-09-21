import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDownRight, ArrowUpRight, Plus, Coffee, ShoppingBag, Car, Zap, Heart, Ticket, Wallet, Briefcase } from 'lucide-react-native';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { Colors, Type, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import TransactionSheet from '@/components/TransactionSheet';

function formatMoney(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function getCategoryIcon(category: string) {
    switch (category) {
        case 'Food': return Coffee;
        case 'Shopping': return ShoppingBag;
        case 'Transport': return Car;
        case 'Bills': return Zap;
        case 'Entertainment': return Ticket;
        case 'Health': return Heart;
        case 'Salary': return Briefcase;
        default: return Wallet;
    }
}

function formatDateHeader(dateStr: string) {
    if (!dateStr) return 'Unknown Date';
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

export default function FinanceScreen() {
    const { phone } = usePhone();
    const theme = useTheme();
    const c = theme.isDark ? Colors.dark : Colors.light;
    const insets = useSafeAreaInsets();
    
    const { items, updateItem, deleteItem, addItem } = usePlannerItems(phone);

    // Filter only finance items
    const financeItems = items.filter(i => i.type === 'expense' || i.type === 'income' || i.type === 'deposit');

    const expenses = financeItems.filter(i => i.type === 'expense');
    const incomes = financeItems.filter(i => i.type !== 'expense');

    const totalSpent = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalEarned = incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const balance = totalEarned - totalSpent;

    // Group transactions by date
    const groupedTransactions = useMemo(() => {
        const groups: Record<string, any[]> = {};
        const sorted = [...financeItems].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        
        sorted.forEach(item => {
            const date = item.date || 'Unknown';
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });
        
        return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
    }, [financeItems]);

    const [editingItem, setEditingItem] = useState<any>(null);
    const [isSheetVisible, setIsSheetVisible] = useState(false);

    const openAddSheet = () => {
        setEditingItem(null);
        setIsSheetVisible(true);
    };

    const openEditSheet = (item: any) => {
        setEditingItem(item);
        setIsSheetVisible(true);
    };

    const handleSave = async (updates: any) => {
        if (editingItem) {
            await updateItem(editingItem.id, updates);
        } else {
            await addItem(updates); // addExpense handles ID in hook usually, but we spread
        }
    };

    return (
        <>
            <ScrollView 
                style={{ flex: 1, backgroundColor: c.background }} 
                contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 120, paddingHorizontal: 20 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <Text style={[Type.displayLg, { color: c.text, marginBottom: 24 }]}>Tracker</Text>

                {/* Main Dashboard Card */}
                <View style={[styles.card, { backgroundColor: theme.isDark ? c.backgroundElement : c.text, ...Shadow.card, marginBottom: 24 }]}>
                    <Text style={[Type.body, { color: theme.isDark ? c.textSecondary : 'rgba(255,255,255,0.7)', marginBottom: 8 }]}>Total Balance</Text>
                    <Text style={[Type.displayLg, { color: theme.isDark ? c.text : '#FFF', marginBottom: 24, fontSize: 40 }]}>{formatMoney(balance)}</Text>
                    
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 16 }}>
                            <View style={{ backgroundColor: c.incomeSoft, padding: 8, borderRadius: 10 }}>
                                <ArrowUpRight color={c.income} size={20} />
                            </View>
                            <View>
                                <Text style={[Type.caption, { color: theme.isDark ? c.textTertiary : 'rgba(255,255,255,0.6)' }]}>Income</Text>
                                <Text style={[Type.body, { color: theme.isDark ? c.text : '#FFF', fontWeight: '700' }]}>{formatMoney(totalEarned)}</Text>
                            </View>
                        </View>
                        
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 16 }}>
                            <View style={{ backgroundColor: c.expenseSoft, padding: 8, borderRadius: 10 }}>
                                <ArrowDownRight color={c.expense} size={20} />
                            </View>
                            <View>
                                <Text style={[Type.caption, { color: theme.isDark ? c.textTertiary : 'rgba(255,255,255,0.6)' }]}>Expenses</Text>
                                <Text style={[Type.body, { color: theme.isDark ? c.text : '#FFF', fontWeight: '700' }]}>{formatMoney(totalSpent)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Transactions List */}
                <Text style={[Type.title, { color: c.text, marginBottom: 16, marginTop: 8 }]}>Recent Transactions</Text>
                
                {groupedTransactions.length === 0 ? (
                    <View style={{ padding: 40, alignItems: 'center', backgroundColor: c.backgroundElement, borderRadius: 24 }}>
                        <Wallet color={c.textTertiary} size={48} style={{ marginBottom: 16 }} />
                        <Text style={[Type.body, { color: c.textTertiary, textAlign: 'center' }]}>No transactions yet.{'\n'}Tap + to add one.</Text>
                    </View>
                ) : (
                    groupedTransactions.map(([date, items]) => (
                        <View key={date} style={{ marginBottom: 24 }}>
                            <Text style={[Type.label, { color: c.textSecondary, marginBottom: 12, marginLeft: 4 }]}>{formatDateHeader(date)}</Text>
                            <View style={{ backgroundColor: c.backgroundElement, borderRadius: 24, overflow: 'hidden' }}>
                                {items.map((item, index) => {
                                    const isIncome = item.type !== 'expense';
                                    const Icon = getCategoryIcon(item.category || 'Other');
                                    return (
                                        <Pressable 
                                            key={item.id}
                                            onPress={() => openEditSheet(item)}
                                            style={({ pressed }) => [
                                                styles.rowItem,
                                                { opacity: pressed ? 0.7 : 1 },
                                                index !== items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
                                            ]}
                                        >
                                            <View style={[styles.iconBox, { backgroundColor: isIncome ? c.incomeSoft : c.border }]}>
                                                <Icon color={isIncome ? c.income : c.textSecondary} size={20} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[Type.body, { color: c.text, fontWeight: '600' }]} numberOfLines={1}>{item.title}</Text>
                                                <Text style={[Type.caption, { color: c.textTertiary, marginTop: 2 }]}>{item.category || 'Other'}</Text>
                                            </View>
                                            <Text style={[Type.body, { color: isIncome ? c.income : c.text, fontWeight: '700' }]}>
                                                {isIncome ? '+' : '-'}{formatMoney(Number(item.amount) || 0)}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            <Pressable 
                onPress={openAddSheet}
                style={{
                    backgroundColor: c.accent,
                    width: 60, height: 60,
                    borderRadius: 30,
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'absolute',
                    bottom: 30, right: 24,
                    ...Shadow.raised,
                    shadowColor: c.accent
                }}>
                <Plus color="#FFF" size={28} />
            </Pressable>

            <TransactionSheet 
                visible={isSheetVisible} 
                item={editingItem} 
                onClose={() => setIsSheetVisible(false)} 
                onSave={handleSave}
                onDelete={deleteItem}
            />
        </>
    );
}

const styles = StyleSheet.create({
  card: { padding: 24, borderRadius: 32 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  iconBox: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
