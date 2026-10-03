import { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { ArrowDownLeft, ArrowUpRight, FileUp, Plus, Search, Tags, Target, Wallet, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import BudgetSheet from '@/components/BudgetSheet';
import { MONTHLY_BUDGET_KEY, budgetStatus, categoryBudgets, summarizeBudget, type BudgetStatus } from '@/lib/budget';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems, useBudgetLimits } from '@/lib/use-planner-items';
import { Colors, Radius, Shadow, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import TransactionSheet, { type MerchantSuggestion } from '@/components/TransactionSheet';
import CycleStepper, { cycleName } from '@/components/finance/CycleStepper';
import FriendsCard from '@/components/finance/FriendsCard';
import { friendBalances, recentFriends, settleUpPatches, splitOf } from '@/lib/splits';

/** "Split with Rahul" / "Split with 3" for a transaction row. */
function splitLabel(item: any) {
    const s = splitOf(item);
    if (!s) return '';
    return s.people.length === 1 ? `Split with ${s.people[0].name}` : `Split with ${s.people.length}`;
}
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import ScreenHeader, { HeaderButton } from '@/components/ScreenHeader';
import { kindForType, resolveCategory, tintColors } from '@/lib/categories';
import { useCategoryConfig } from '@/lib/use-category-config';
import { amountOf, cycleRange, isMoney } from '@/lib/finance-analysis';
import SegmentedControl from '@/components/SegmentedControl';
import CategoryManager from '@/components/CategoryManager';
import AnalysisView from '@/components/finance/AnalysisView';

const TYPE_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'expense', label: 'Expenses' },
    { key: 'income', label: 'Income' },
    { key: 'transfer', label: 'Transfers' },
] as const;
type TypeFilter = typeof TYPE_FILTERS[number]['key'];

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

/** "13:06" → "1:06 PM" */
function formatTime(hhmm?: string | null) {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return '';
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

const SOURCE_LABEL: Record<string, string> = { sms: 'SMS', email: 'Email', gmail: 'Email', statement: 'Statement' };

export default function FinanceScreen() {
    const { phone } = usePhone();
    const theme = useTheme();
    const c = theme.isDark ? Colors.dark : Colors.light;
    
    const { items, loading, updateItem, deleteItem, addItem, refresh } = usePlannerItems(phone);
    const router = useRouter();
    const [refreshing, setRefreshing] = useState(false);
    if (refreshing && !loading) setRefreshing(false);

    // Filter only finance items
    
    const { budgetLimits: limits, saveBudgets } = useBudgetLimits(phone);
    const { config: categoryConfig, learnMerchant } = useCategoryConfig();
    const [budgetOpen, setBudgetOpen] = useState(false);
    const [categoriesOpen, setCategoriesOpen] = useState(false);
    const [view, setView] = useState<'Overview' | 'Analysis'>('Overview');
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const nameOf = (i: { category?: string; type?: string }) => resolveCategory(i.category, kindForType(i.type), categoryConfig).name;
    const payday = limits?.payday || 1;
    
    // The salary cycle on screen (0 = current, -1 = the one before), shared by Overview and Analysis
    const [offset, setOffset] = useState(0);
    const inProgress = offset === 0;
    const { start: cycleStart, end: cycleEnd, startKey: cycleStartStr, endKey: cycleEndStr } = cycleRange(payday, offset);

    // Finance items in the cycle on screen
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
            const cat = nameOf(e);
            totals[cat] = (totals[cat] || 0) + (Number(e.amount) || 0);
        });
        const limitsByCat = categoryBudgets(limits);
        for (const name of Object.keys(limitsByCat)) totals[name] = totals[name] || 0;
        return Object.entries(totals)
            .map(([name, amount]) => { const cat = resolveCategory(name, 'expense', categoryConfig); return { name, amount, limit: limitsByCat[name] || 0, icon: cat.icon, tint: cat.tint }; })
            // budgeted categories first (most used first), then the biggest unbudgeted ones
            .sort((a, b) => (b.limit ? 1 : 0) - (a.limit ? 1 : 0) || (b.limit ? b.amount / b.limit - a.amount / a.limit : b.amount - a.amount))
            .filter((cat, i) => cat.limit > 0 || i < 6);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenses, limits, categoryConfig]);

    const balance = totalEarned - totalSpent;
    const monthlyBudget = Number(limits?.[MONTHLY_BUDGET_KEY]) || 0;
    const budget = monthlyBudget > 0 ? summarizeBudget(monthlyBudget, totalSpent, cycleEnd) : null;
    const periodName = cycleName(payday, offset);
    // "last cycle" / "in August 2026", for sentences about a past cycle
    const inPeriod = offset === -1 ? 'last cycle' : `in ${periodName}`;

    // Places you've paid recently, most used first, for one-tap filling in the add sheet
    const suggestSince = cycleRange(payday, -3).startKey;
    const suggestions = useMemo<MerchantSuggestion[]>(() => {
        const since = suggestSince;
        const seen = new Map<string, MerchantSuggestion & { n: number; last: string }>();
        for (const i of items) {
            if (!isMoney(i) || i.type === 'transfer' || !i.title?.trim() || (i.date || '') < since) continue;
            const key = `${kindForType(i.type)}|${i.title.trim().toLowerCase()}`;
            const prev = seen.get(key);
            const latest = !prev || (i.date || '') >= prev.last;
            seen.set(key, {
                title: latest ? i.title.trim() : prev!.title,
                category: latest ? nameOf(i) : prev!.category,
                type: i.type || 'expense',
                n: (prev?.n || 0) + 1,
                last: latest ? i.date || '' : prev!.last,
            });
        }
        return [...seen.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, 20);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, categoryConfig, suggestSince]);

    // Splitwise-style balances with friends, across all time
    const balances = useMemo(() => friendBalances(items), [items]);
    const friends = useMemo(() => recentFriends(items), [items]);
    const settleUp = (name: string) => {
        for (const p of settleUpPatches(items, name)) void updateItem(p.id, { split: p.split });
    };

    // Any filter searches all of history; otherwise the list shows the cycle on screen.
    const filtering = query.trim() !== '' || typeFilter !== 'all' || categoryFilter !== null;
    const listItems = useMemo(() => {
        if (!filtering) return financeItems;
        const q = query.trim().toLowerCase();
        return items.filter(i => {
            if (!isMoney(i)) return false;
            if (typeFilter !== 'all' && kindForType(i.type) !== typeFilter) return false;
            if (categoryFilter && nameOf(i) !== categoryFilter) return false;
            if (q && !`${i.title || ''} ${nameOf(i)} ${i.amount ?? ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtering, financeItems, items, query, typeFilter, categoryFilter, categoryConfig]);
    const listTotal = listItems.reduce((sum, i) => sum + (i.type === 'expense' ? -amountOf(i) : i.type === 'transfer' ? 0 : amountOf(i)), 0);

    // Group transactions by date
    const groupedTransactions = useMemo(() => {
        const groups: Record<string, any[]> = {};
        // Newest first, by date and then time (transactions without a time last within their day)
        const sorted = [...listItems].sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`));
        
        sorted.forEach(item => {
            const date = item.date || 'Unknown';
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });
        
        return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
    }, [listItems]);

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
            // Changing a transaction's category teaches Align that merchant's category for next time.
            if (updates.category && updates.category !== editingItem.category && (updates.title || editingItem.title)) {
                void learnMerchant(updates.title || editingItem.title, updates.category);
            }
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
                onScroll={collapseQuickAddOnScroll}
                scrollEventThrottle={16}
                refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={() => { setRefreshing(true); refresh(); }} />}
            >
                <ScreenHeader
                    title="Money"
                    subtitle={`Salary cycle · ${cycleLabel}`}
                    actions={
                        <>
                            <HeaderButton label="Import statement" onPress={() => router.push('/settings/import')}>
                                <FileUp color={c.text} size={19} />
                            </HeaderButton>
                            <HeaderButton label="Add transaction" onPress={openAddSheet} filled>
                                <Plus color={c.onAccent} size={20} strokeWidth={2.5} />
                            </HeaderButton>
                        </>
                    }
                />

                <View style={styles.content}>
                    <SegmentedControl tabs={['Overview', 'Analysis']} activeTab={view} onTabChange={t => setView(t as 'Overview' | 'Analysis')} />
                    <View style={{ height: 12 }} />

                    {view === 'Analysis' ? (
                        <AnalysisView
                            items={items}
                            payday={payday}
                            config={categoryConfig}
                            offset={offset}
                            onOffsetChange={setOffset}
                            onSelectCategory={name => { setCategoryFilter(name); setTypeFilter('expense'); setView('Overview'); }}
                        />
                    ) : (<>
                    <CycleStepper payday={payday} offset={offset} onChange={setOffset} />
                    {/* Budget / balance card */}
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={budget ? 'Edit budget' : 'Set a monthly budget'}
                        onPress={() => setBudgetOpen(true)}
                        style={[styles.hero, { backgroundColor: budget?.status === 'over' ? c.expense : c.heroFill }, Shadow.raised]}
                    >
                        {budget ? (
                            <>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={[styles.heroLabel, { color: c.onHero }]}>{budget.left < 0 ? 'Over budget by' : inProgress ? 'Left to spend' : `Saved ${inPeriod}`}</Text>
                                    <Text style={[styles.heroLabel, { color: c.onHero }]}>Budget {formatMoney(budget.budget)}</Text>
                                </View>
                                <Text style={[styles.heroAmount, { color: c.onHero }]} numberOfLines={1} adjustsFontSizeToFit>
                                    {formatMoney(Math.abs(budget.left))}
                                </Text>
                                <View style={[styles.heroTrack, { backgroundColor: c.onHeroOverlay }]}>
                                    <View style={{ width: `${Math.round(Math.min(1, budget.used) * 100)}%`, height: '100%', backgroundColor: c.heroBar, borderRadius: Radius.pill }} />
                                </View>
                                <Text style={[styles.heroNote, { color: c.onHero }]}>
                                    {budget.status === 'over' || !inProgress
                                        ? `${formatMoney(budget.spent)} spent of ${formatMoney(budget.budget)}`
                                        : `${Math.round(budget.used * 100)}% used · ${formatMoney(budget.perDay)}/day for ${budget.daysLeft} ${budget.daysLeft === 1 ? 'day' : 'days'}`}
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text style={[styles.heroLabel, { color: c.onHero }]}>{inProgress ? 'Left this cycle' : balance >= 0 ? `Saved ${inPeriod}` : `Overspent ${inPeriod}`}</Text>
                                <Text style={[styles.heroAmount, { color: c.onHero }]} numberOfLines={1} adjustsFontSizeToFit>
                                    {formatMoney(inProgress ? balance : Math.abs(balance))}
                                </Text>
                                <View style={[styles.heroTrack, { backgroundColor: c.onHeroOverlay }]}>
                                    <View style={{ width: `${Math.round(spentShare * 100)}%`, height: '100%', backgroundColor: c.heroBar, borderRadius: Radius.pill }} />
                                </View>
                                <Text style={[styles.heroNote, { color: c.onHero }]}>
                                    {totalEarned > 0 ? `${Math.round(spentShare * 100)}% of income spent` : `No income logged ${inProgress ? 'this cycle' : 'in this period'}`}
                                </Text>
                            </>
                        )}

                        <View style={styles.heroStats}>
                            <View style={[styles.heroStat, { backgroundColor: c.incomeFill }]}>
                                <View style={styles.heroStatIcon}><ArrowDownLeft color="#FFFFFF" size={16} strokeWidth={2.5} /></View>
                                <View>
                                    <Text style={[styles.heroStatLabel, { color: '#FFFFFF' }]}>Income</Text>
                                    <Text style={[styles.heroStatValue, { color: '#FFFFFF' }]}>{formatMoney(totalEarned)}</Text>
                                </View>
                            </View>
                            <View style={[styles.heroStat, { backgroundColor: c.expenseFill }]}>
                                <View style={styles.heroStatIcon}><ArrowUpRight color="#FFFFFF" size={16} strokeWidth={2.5} /></View>
                                <View>
                                    <Text style={[styles.heroStatLabel, { color: '#FFFFFF' }]}>Spent</Text>
                                    <Text style={[styles.heroStatValue, { color: '#FFFFFF' }]}>{formatMoney(totalSpent)}</Text>
                                </View>
                            </View>
                        </View>
                    </Pressable>

                    {!budget && (
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => setBudgetOpen(true)}
                            style={[styles.setBudget, { backgroundColor: c.backgroundElement, borderColor: c.border }]}
                        >
                            <Target color={c.accent} size={18} />
                            <Text style={{ color: c.text, fontWeight: '600', flex: 1 }}>Set a monthly budget</Text>
                            <Text style={{ color: c.accent, fontWeight: '700' }}>Set</Text>
                        </Pressable>
                    )}

                    {/* Spending by category */}
                    {categoryTotals.length > 0 && (
                        <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>Where it went</Text>
                                <View style={{ flexDirection: 'row', gap: 16 }}>
                                    <Pressable accessibilityRole="button" onPress={() => setCategoriesOpen(true)} hitSlop={8}>
                                        <Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>Edit categories</Text>
                                    </Pressable>
                                    <Pressable accessibilityRole="button" onPress={() => setBudgetOpen(true)} hitSlop={8}>
                                        <Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>Limits</Text>
                                    </Pressable>
                                </View>
                            </View>
                            <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border, padding: 16, gap: 16 }, Shadow.card]}>
                                {categoryTotals.map(cat => {
                                    const Icon = cat.icon;
                                    const tint = tintColors(cat.tint, theme.isDark);
                                    const share = cat.limit ? cat.amount / cat.limit : cat.amount / Math.max(totalSpent, 1);
                                    const status: BudgetStatus | null = cat.limit ? budgetStatus(share) : null;
                                    const barColor = status === 'over' ? c.expense : status === 'warning' ? c.warning : tint.fg;
                                    return (
                                        <Pressable key={cat.name} accessibilityRole="button" accessibilityLabel={`Show ${cat.name} transactions`} onPress={() => { setCategoryFilter(cat.name); setTypeFilter('expense'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <View style={[styles.catIcon, { backgroundColor: tint.bg }]}>
                                                <Icon color={tint.fg} size={16} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }}>
                                                    <Text style={[Type.label, { color: c.text, fontWeight: '600' }]}>{cat.name}</Text>
                                                    <Text style={[Type.label, { color: status === 'over' ? c.expense : c.textSecondary, fontVariant: ['tabular-nums'] }]}>
                                                        {cat.limit
                                                            ? `${formatMoney(cat.amount)} of ${formatMoney(cat.limit)}`
                                                            : `${formatMoney(cat.amount)} · ${Math.round(share * 100)}%`}
                                                    </Text>
                                                </View>
                                                <View style={[styles.catTrack, { backgroundColor: c.backgroundMuted }]}>
                                                    <View style={{ width: `${Math.min(100, share * 100)}%`, height: '100%', backgroundColor: barColor, borderRadius: Radius.pill }} />
                                                </View>
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </>
                    )}

                    {!filtering && <FriendsCard balances={balances} onSettle={settleUp} />}

                    {/* Transactions */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>{filtering ? 'All-time results' : inProgress ? 'Transactions this cycle' : `Transactions · ${periodName}`}</Text>
                        {categoryTotals.length === 0 && (
                            <Pressable accessibilityRole="button" onPress={() => setCategoriesOpen(true)} hitSlop={8}>
                                <Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>Edit categories</Text>
                            </Pressable>
                        )}
                    </View>

                    <View style={[styles.search, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                        <Search color={c.textTertiary} size={17} />
                        <TextInput
                            accessibilityLabel="Search transactions"
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search by name, category or amount"
                            placeholderTextColor={c.textTertiary}
                            style={[styles.searchInput, { color: c.text }]}
                            returnKeyType="search"
                        />
                        {query !== '' && (
                            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
                                <X color={c.textTertiary} size={16} />
                            </Pressable>
                        )}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                        {TYPE_FILTERS.map(f => {
                            const active = typeFilter === f.key;
                            return (
                                <Pressable key={f.key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setTypeFilter(f.key)}
                                    style={[styles.filterChip, active ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                                    <Text style={{ color: active ? c.onAccent : c.text, fontWeight: '600', fontSize: 13 }}>{f.label}</Text>
                                </Pressable>
                            );
                        })}
                        {categoryFilter && (
                            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${categoryFilter} filter`} onPress={() => setCategoryFilter(null)}
                                style={[styles.filterChip, { backgroundColor: c.accentSoft, borderColor: c.accentSoft, flexDirection: 'row', gap: 6 }]}>
                                <Tags color={c.accent} size={14} />
                                <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{categoryFilter}</Text>
                                <X color={c.accent} size={14} />
                            </Pressable>
                        )}
                    </ScrollView>
                    {filtering && (
                        <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 10 }}>
                            {listItems.length} {listItems.length === 1 ? 'transaction' : 'transactions'} · net {listTotal < 0 ? '−' : '+'}{formatMoney(Math.abs(listTotal))}
                        </Text>
                    )}

                    {groupedTransactions.length === 0 ? (
                        <View style={[styles.empty, { borderColor: c.border }]}>
                            <Wallet color={c.textTertiary} size={32} />
                            <Text style={[Type.body, { color: c.textSecondary, textAlign: 'center' }]}>{filtering ? 'Nothing matches these filters.' : <>No transactions yet.{'\n'}Tap + to add one, or import a bank statement.</>}</Text>
                        </View>
                    ) : (
                        groupedTransactions.map(([date, items]) => (
                            <View key={date} style={{ marginBottom: 16 }}>
                                <Text style={[styles.dateHeader, { color: c.textSecondary }]}>{formatDateHeader(date)}</Text>
                                <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
                                    {items.map((item, index) => {
                                        const isIncome = item.type === 'income' || item.type === 'deposit';
                                        const isTransfer = item.type === 'transfer';
                                        const category = resolveCategory(item.category, kindForType(item.type), categoryConfig);
                                        const Icon = category.icon;
                                        const tint = tintColors(category.tint, theme.isDark);
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
                                                <View style={[styles.iconBox, { backgroundColor: tint.bg }]}>
                                                    <Icon color={tint.fg} size={18} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[Type.body, { color: c.text, fontWeight: '600' }]} numberOfLines={1}>{item.title}</Text>
                                                    <Text style={[Type.caption, { color: c.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                                                        {[category.name, splitLabel(item), formatTime(item.time), item.autoDetected ? SOURCE_LABEL[item.source] || 'Auto' : ''].filter(Boolean).join(' · ')}
                                                    </Text>
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
                    </>)}
                </View>
            </ScrollView>

            <CategoryManager
                visible={categoriesOpen}
                onClose={() => setCategoriesOpen(false)}
                items={items}
                updateItem={updateItem}
                budgets={limits as Record<string, number>}
                saveBudgets={saveBudgets}
            />
            <BudgetSheet
                visible={budgetOpen}
                onClose={() => setBudgetOpen(false)}
                monthly={monthlyBudget}
                categories={categoryBudgets(limits)}
                onSave={saveBudgets}
            />
            <TransactionSheet
                visible={isSheetVisible}
                item={editingItem}
                onClose={() => setIsSheetVisible(false)}
                onSave={handleSave}
                onDelete={deleteItem}
                suggestions={suggestions}
                friends={friends}
            />
        </>
    );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  hero: { padding: 20, borderRadius: Radius.xl, marginBottom: 8 },
  setBudget: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: Radius.lg, borderWidth: 1, marginTop: 4 },
  heroLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2, opacity: 0.7 },
  heroAmount: { fontSize: 42, fontWeight: '800', letterSpacing: -1, marginTop: 4, fontVariant: ['tabular-nums'] },
  heroTrack: { height: 6, borderRadius: Radius.pill, overflow: 'hidden', marginTop: 16 },
  heroNote: { fontSize: 12, fontWeight: '600', marginTop: 8, opacity: 0.7 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md },
  heroStatIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)' },
  heroStatLabel: { fontSize: 11, fontWeight: '600', opacity: 0.9 },
  heroStatValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sectionHeader: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  dateHeader: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 2 },
  group: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  catIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  catTrack: { height: 5, borderRadius: Radius.pill, overflow: 'hidden' },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  iconBox: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 11 },
  filters: { gap: 8, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center' },
  empty: { padding: 32, alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
});
