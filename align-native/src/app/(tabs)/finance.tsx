import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { ArrowDownLeft, ArrowUpRight, Plus, Wallet } from 'lucide-react-native';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems, useBudgetLimits } from '@/lib/use-planner-items';
import { Colors, Fonts, Radius, Shadow, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import TransactionSheet from '@/components/TransactionSheet';
import ScreenHeader, { HeaderButton } from '@/components/ScreenHeader';
import { kindForType, resolveCategory } from '@/lib/categories';

function formatMoney(amount: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
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
    
    const { items, updateItem, deleteItem, addItem } = usePlannerItems(phone);

    // Filter only finance items
    
    const { budgetLimits: limits } = useBudgetLimits(phone);
    const payday = limits?.payday || 1;
    
    // Calculate current cycle dates
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let cycleStart = new Date(currentYear, currentMonth, payday);
    if (today.getDate() < payday) {
        cycleStart = new Date(currentYear, currentMonth - 1, payday);
    }
    
    let cycleEnd = new Date(cycleStart);
    cycleEnd.setMonth(cycleStart.getMonth() + 1);
    
    const cycleStartStr = cycleStart.toISOString().split('T')[0];
    const cycleEndStr = cycleEnd.toISOString().split('T')[0];

    // Filter only finance items for the CURRENT CYCLE
    const financeItems = items.filter(i => {
        if (i.type !== 'expense' && i.type !== 'income' && i.type !== 'deposit' && i.type !== 'transfer') return false;
        const d = i.date || '1970-01-01';
        return d >= cycleStartStr && d < cycleEndStr;
    });


    const expenses = financeItems.filter(i => i.type === 'expense');
    const incomes = financeItems.filter(i => i.type !== 'expense' && i.type !== 'transfer');

    const totalSpent = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalEarned = incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    const categoryTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        expenses.forEach(e => {
            const cat = resolveCategory(e.category).name;
            totals[cat] = (totals[cat] || 0) + (Number(e.amount) || 0);
        });
        return Object.entries(totals)
            .map(([name, amount]) => ({ name, amount, icon: resolveCategory(name).icon }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 4); // Top 4
    }, [expenses]);

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

    const spentShare = totalEarned > 0 ? Math.min(1, totalSpent / totalEarned) : 0;
    const cycleLabel = `${cycleStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(cycleEnd.getTime() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    return (
        <>
            <ScrollView
                style={{ flex: 1, backgroundColor: c.background }}
                contentContainerStyle={{ paddingBottom: 150 }}
                showsVerticalScrollIndicator={false}
            >
                <ScreenHeader
                    title="Money"
                    subtitle={`Salary cycle · ${cycleLabel}`}
                    actions={
                        <HeaderButton label="Add transaction" onPress={openAddSheet} filled>
                            <Plus color={c.onAccent} size={20} strokeWidth={2.5} />
                        </HeaderButton>
                    }
                />

                <View style={styles.content}>
                    {/* Balance card */}
                    <View style={[styles.hero, { backgroundColor: c.accentFill }, Shadow.raised]}>
                        <Text style={[styles.heroLabel, { color: c.onAccent }]}>Left this cycle</Text>
                        <Text style={[styles.heroAmount, { color: c.onAccent }]} numberOfLines={1} adjustsFontSizeToFit>
                            {formatMoney(balance)}
                        </Text>

                        <View style={[styles.heroTrack, { backgroundColor: c.onAccentOverlay }]}>
                            <View style={{ width: `${Math.round(spentShare * 100)}%`, height: '100%', backgroundColor: c.onAccent, borderRadius: Radius.pill }} />
                        </View>
                        <Text style={[styles.heroNote, { color: c.onAccent }]}>
                            {totalEarned > 0 ? `${Math.round(spentShare * 100)}% of income spent` : 'No income logged this cycle'}
                        </Text>

                        <View style={styles.heroStats}>
                            <View style={[styles.heroStat, { backgroundColor: c.onAccentOverlay }]}>
                                <ArrowDownLeft color={c.onAccent} size={16} strokeWidth={2.5} />
                                <View>
                                    <Text style={[styles.heroStatLabel, { color: c.onAccent }]}>Income</Text>
                                    <Text style={[styles.heroStatValue, { color: c.onAccent }]}>{formatMoney(totalEarned)}</Text>
                                </View>
                            </View>
                            <View style={[styles.heroStat, { backgroundColor: c.onAccentOverlay }]}>
                                <ArrowUpRight color={c.onAccent} size={16} strokeWidth={2.5} />
                                <View>
                                    <Text style={[styles.heroStatLabel, { color: c.onAccent }]}>Spent</Text>
                                    <Text style={[styles.heroStatValue, { color: c.onAccent }]}>{formatMoney(totalSpent)}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Spending by category */}
                    {categoryTotals.length > 0 && (
                        <>
                            <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>Where it went</Text>
                            <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border, padding: 16, gap: 16 }, Shadow.card]}>
                                {categoryTotals.map(cat => {
                                    const Icon = cat.icon;
                                    const share = cat.amount / Math.max(totalSpent, 1);
                                    return (
                                        <View key={cat.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <View style={[styles.catIcon, { backgroundColor: c.backgroundMuted }]}>
                                                <Icon color={c.textSecondary} size={16} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }}>
                                                    <Text style={[Type.label, { color: c.text, fontWeight: '600' }]}>{cat.name}</Text>
                                                    <Text style={[Type.label, { color: c.textSecondary, fontVariant: ['tabular-nums'] }]}>
                                                        {formatMoney(cat.amount)} · {Math.round(share * 100)}%
                                                    </Text>
                                                </View>
                                                <View style={[styles.catTrack, { backgroundColor: c.backgroundMuted }]}>
                                                    <View style={{ width: `${Math.min(100, share * 100)}%`, height: '100%', backgroundColor: c.text, borderRadius: Radius.pill }} />
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {/* Transactions */}
                    <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>Transactions</Text>

                    {groupedTransactions.length === 0 ? (
                        <View style={[styles.empty, { borderColor: c.border }]}>
                            <Wallet color={c.textTertiary} size={32} />
                            <Text style={[Type.body, { color: c.textSecondary, textAlign: 'center' }]}>No transactions yet.{'\n'}Tap + to add one.</Text>
                        </View>
                    ) : (
                        groupedTransactions.map(([date, items]) => (
                            <View key={date} style={{ marginBottom: 16 }}>
                                <Text style={[styles.dateHeader, { color: c.textSecondary }]}>{formatDateHeader(date)}</Text>
                                <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
                                    {items.map((item, index) => {
                                        const isIncome = item.type === 'income' || item.type === 'deposit';
                                        const isTransfer = item.type === 'transfer';
                                        const category = resolveCategory(item.category, kindForType(item.type));
                                        const Icon = category.icon;
                                        return (
                                            <Pressable
                                                key={item.id}
                                                onPress={() => openEditSheet(item)}
                                                style={({ pressed }) => [
                                                    styles.rowItem,
                                                    { opacity: pressed ? 0.7 : 1 },
                                                    index !== items.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                                                ]}
                                            >
                                                <View style={[styles.iconBox, { backgroundColor: isIncome ? c.incomeSoft : c.backgroundMuted }]}>
                                                    <Icon color={isIncome ? c.income : c.textSecondary} size={18} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[Type.body, { color: c.text, fontWeight: '600' }]} numberOfLines={1}>{item.title}</Text>
                                                    <Text style={[Type.caption, { color: c.textTertiary, marginTop: 2 }]}>{category.name}</Text>
                                                </View>
                                                <Text style={[Type.body, { color: isIncome ? c.income : (isTransfer ? c.textSecondary : c.text), fontWeight: '700', fontVariant: ['tabular-nums'] }]}>
                                                    {isTransfer ? '' : (isIncome ? '+' : '−')}{formatMoney(Number(item.amount) || 0)}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

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
  content: { paddingHorizontal: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  hero: { padding: 20, borderRadius: Radius.xl, marginBottom: 8 },
  heroLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2, opacity: 0.7 },
  heroAmount: { fontSize: 42, fontWeight: '800', letterSpacing: -1, marginTop: 4, fontVariant: ['tabular-nums'], fontFamily: Fonts?.rounded },
  heroTrack: { height: 6, borderRadius: Radius.pill, overflow: 'hidden', marginTop: 16 },
  heroNote: { fontSize: 12, fontWeight: '600', marginTop: 8, opacity: 0.7 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md },
  heroStatLabel: { fontSize: 11, fontWeight: '600', opacity: 0.65 },
  heroStatValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sectionHeader: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  dateHeader: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 },
  group: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  catIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  catTrack: { height: 5, borderRadius: Radius.pill, overflow: 'hidden' },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  iconBox: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 32, alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
});
