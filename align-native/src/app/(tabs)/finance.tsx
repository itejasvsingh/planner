import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Share, View, ScrollView, StyleSheet, RefreshControl, type TextInput as RNTextInput } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { ArrowDownLeft, ArrowUpRight, Bookmark, CalendarClock, Check, Download, MapPin, FileUp, Plus, Search, ShieldAlert, SlidersHorizontal, Tags, Users, Wallet, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import BudgetSheet from '@/components/BudgetSheet';
import { MONTHLY_BUDGET_KEY, budgetStatus, categoryBudgets, summarizeBudget, type BudgetStatus } from '@/lib/budget';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems, useBudgetLimits } from '@/lib/use-planner-items';
import { useCards } from '@/lib/cards-store';
import { adjustBalances } from '@/lib/account-balances';
import { dueLabel, upcomingPayments } from '@/lib/upcoming';
import { cardTitle } from '@/lib/card-format';
import { Colors, Radius, Shadow, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import TransactionSheet from '@/components/TransactionSheet';
import CycleStepper, { cycleName } from '@/components/finance/CycleStepper';
import FriendsCard from '@/components/finance/FriendsCard';
import ReviewSheet from '@/components/finance/ReviewSheet';
import CategoryPicker from '@/components/CategoryPicker';
import { findSuspicious } from '@/lib/suspicious';
import { todayKey } from '@/lib/dates';
import NinetyDayView from '@/components/finance/NinetyDayView';
import { savePlace } from '@/lib/places-store';
import { spotCentre, type Spot } from '@/lib/places';
import { friendBalances, friendHistory, groupDefaultDraft, groupNames, groupTotals, inGroup, recentFriends, settleAmountPatches, settleUpPatches, splitOf, type SplitDraft } from '@/lib/splits';

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
import { amountOf, cycleRange, isCardPayment, isMoney, leftOutOfFlow, matchesFlags, toCsv, type FlagFilter } from '@/lib/finance-analysis';
import SegmentedControl from '@/components/SegmentedControl';
import CategoryManager from '@/components/CategoryManager';
import AnalysisView from '@/components/finance/AnalysisView';
import SwipeRow from '@/components/SwipeRow';
import { useShowLabels } from '@/lib/display-prefs';

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

    const { budgetLimits: limits, saveBudgets } = useBudgetLimits(phone);
    
    const cardData = useCards(phone);
    // Card dues use what is owed now (the same adjusted figures as Wallet)
    const adjusted = useMemo(() => (cardData ? adjustBalances(cardData.accounts || [], cardData.cards || [], items) : null), [cardData, items]);
    // Card dues use what's owed now; card reminder tasks aren't listed separately, so a card never shows twice
    const upcoming = useMemo(() => upcomingPayments(items as any, (adjusted?.cards || []).map(k => ({ title: cardTitle(k), dueDate: k.dueDate, outstanding: k.outstanding, hidden: k.hidden, status: k.status })), new Date(), 14), [items, adjusted]);
    const cardNameMap = useMemo(() => {
        const map = new Map<string, string>();
        (cardData?.cards || []).forEach(c => c.last4 && map.set(c.last4, c.issuerName || c.issuer));
        (cardData?.accounts || []).forEach(a => a.last4 && map.set(a.last4, a.bankName));
        return map;
    }, [cardData]);
    const { config: categoryConfig, learnMerchant } = useCategoryConfig();
    const [budgetOpen, setBudgetOpen] = useState(false);
    const [categoriesOpen, setCategoriesOpen] = useState(false);
    const [moreFilters, setMoreFilters] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [categoriesShown, setCategoriesShown] = useState(false);
    const showLabels = useShowLabels();
    type MoneyView = 'Overview' | 'Analysis' | 'Split';
    const [view, setView] = useState<MoneyView>('Overview');
    const [analysisMode, setAnalysisMode] = useState<'cycle' | '90'>('cycle');
    const [query, setQuery] = useState('');
    const searchRef = useRef<RNTextInput>(null);
    // Web: Cmd/Ctrl+K jumps to the search box
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setView('Overview');
                setSearchOpen(true);
                setTimeout(() => searchRef.current?.focus(), 150);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [placeFilter, setPlaceFilter] = useState<string | null>(null);
    const [flagFilters, setFlagFilters] = useState<Set<FlagFilter>>(new Set());
    const toggleFlag = (f: FlagFilter) => setFlagFilters(prev => { const next = new Set(prev); if (next.has(f)) next.delete(f); else next.add(f); return next; });
    // Merchant being renamed in the list
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameText, setRenameText] = useState('');
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


    const expenses = financeItems.filter(i => i.type === 'expense' && !isCardPayment(i) && !i.excluded);
    const incomes = financeItems.filter(i => i.type !== 'expense' && i.type !== 'transfer' && !i.excluded && !i.refundOf);

    const totalSpent = expenses.reduce((acc, curr) => acc + amountOf(curr), 0);
    const totalEarned = incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    // Spending by category for the cycle on screen (budgeted ones first), shown under "Categories"
    const categoryTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        expenses.forEach(e => {
            const cat = nameOf(e);
            totals[cat] = (totals[cat] || 0) + amountOf(e);
        });
        const limitsByCat = categoryBudgets(limits);
        for (const name of Object.keys(limitsByCat)) totals[name] = totals[name] || 0;
        return Object.entries(totals)
            .map(([name, amount]) => { const cat = resolveCategory(name, 'expense', categoryConfig); return { name, amount, limit: limitsByCat[name] || 0, icon: cat.icon, tint: cat.tint }; })
            .sort((a, b) => (b.limit ? 1 : 0) - (a.limit ? 1 : 0) || (b.limit ? b.amount / b.limit - a.amount / a.limit : b.amount - a.amount))
            .filter((cat, i) => cat.limit > 0 || i < 8);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenses, limits, categoryConfig]);

    const balance = totalEarned - totalSpent;
    const monthlyBudget = Number(limits?.[MONTHLY_BUDGET_KEY]) || 0;
    const budget = monthlyBudget > 0 ? summarizeBudget(monthlyBudget, totalSpent, cycleEnd) : null;
    const periodName = cycleName(payday, offset);
    // "last cycle" / "in August 2026", for sentences about a past cycle
    const inPeriod = offset === -1 ? 'last cycle' : `in ${periodName}`;


    // Payments that look unusual for you (last 30 days against your 90-day history)
    const today = todayKey();
    const flags = useMemo(() => findSuspicious(items, today), [items, today]);
    const reported = useMemo(() => items.filter(i => i.review === 'not_me'), [items]);
    const [reviewOpen, setReviewOpen] = useState(false);

    // Splitwise-style balances with friends, across all time
    const [group, setGroup] = useState<string | null>(null);
    const groups = useMemo(() => groupTotals(items), [items]);
    // A group that no longer has any split falls back to "All"
    const activeGroup = group && groups.some(g => g.name === group) ? group : null;
    const balances = useMemo(() => friendBalances(activeGroup ? inGroup(items, activeGroup) : items), [items, activeGroup]);
    const friends = useMemo(() => recentFriends(items), [items]);
    // How each group was last split (friends, who paid, method), to start a new split in it
    const groupDrafts = useMemo(() => {
        const out: Record<string, SplitDraft> = {};
        for (const name of groupNames(items)) { const d = groupDefaultDraft(items, name); if (d) out[name.toLowerCase()] = d; }
        return out;
    }, [items]);
    // Settling and payments act on the group on screen, or on everything with that friend when "All" is chosen
    const scoped = (name: string) => (activeGroup ? inGroup(items, activeGroup) : items).filter(i => !!splitOf(i)?.people.some(p => p.name.toLowerCase() === name.toLowerCase()) || splitOf(i)?.paidBy.toLowerCase() === name.toLowerCase());
    const settleUp = (name: string) => {
        for (const p of settleUpPatches(scoped(name), name)) void updateItem(p.id, { split: p.split });
    };
    const payFriend = (name: string, amount: number) => {
        for (const p of settleAmountPatches(scoped(name), name, amount).patches) void updateItem(p.id, { split: p.split });
    };

    // The chips filter the cycle on screen; typing a search looks through all of history.
    const searching = query.trim() !== '';
    const filtering = searching || typeFilter !== 'all' || categoryFilter !== null || placeFilter !== null || flagFilters.size > 0;
    const listItems = useMemo(() => {
        if (!filtering) return financeItems;
        const q = query.trim().toLowerCase();
        return (searching ? items : financeItems).filter(i => {
            if (!isMoney(i)) return false;
            if (typeFilter !== 'all' && kindForType(i.type) !== typeFilter) return false;
            if (categoryFilter && nameOf(i) !== categoryFilter) return false;
            if (placeFilter && (i.placeName || '').toLowerCase() !== placeFilter.toLowerCase()) return false;
            if (flagFilters.size && !matchesFlags(i, flagFilters)) return false;
            if (q && !`${i.title || ''} ${nameOf(i)} ${i.amount ?? ''} ${i.note || ''} ${(i.tags || []).map((x: string) => `#${x} ${x}`).join(' ')}`.toLowerCase().includes(q)) return false;
            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtering, searching, financeItems, items, query, typeFilter, categoryFilter, placeFilter, flagFilters, categoryConfig]);
    // Counts on the "Untagged" and "No merchant" chips (this cycle)
    const untaggedCount = financeItems.filter(i => matchesFlags(i, ['untagged'])).length;
    const noMerchantCount = financeItems.filter(i => matchesFlags(i, ['nomerchant'])).length;
    const activeFilterCount = (typeFilter !== 'all' ? 1 : 0) + flagFilters.size;
    const filtersShown = moreFilters || activeFilterCount > 0 || categoriesShown;
    const searchShown = searchOpen || searching;
    const exportCsv = async () => {
        const csv = toCsv([...listItems].sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`)), nameOf);
        if (Platform.OS === 'web') {
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `align-transactions-${todayKey()}.csv`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
            await Share.share({ message: csv, title: 'Align transactions' });
        }
    };
    const commitRename = (item: any) => {
        const t = renameText.trim();
        setRenamingId(null);
        if (!t || t === item.title) return;
        void updateItem(item.id, { title: t });
    };
    const listTotal = listItems.reduce((sum, i) => sum + (leftOutOfFlow(i) ? 0 : i.type === 'expense' ? -amountOf(i) : amountOf(i)), 0);

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
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkCategoryPickerVisible, setBulkCategoryPickerVisible] = useState(false);
    const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);
    const selecting = selectedIds.size > 0;
    const toggleSelected = (id: string) => {
        setBulkConfirmDelete(false);
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const selectedItems = () => items.filter(i => selectedIds.has(i.id));
    const clearSelection = () => { setSelectedIds(new Set()); setBulkConfirmDelete(false); setBulkCategoryPickerVisible(false); };
    // Same as editing one by one: a new category is remembered for each payee
    const bulkCategorize = (category: string) => {
        for (const i of selectedItems()) {
            if (i.type === 'transfer') continue;
            void updateItem(i.id, { category, tags: [category] });
            if (i.title) void learnMerchant(i.title, category, i.type);
        }
        clearSelection();
    };
    const bulkTransfer = () => {
        for (const i of selectedItems()) {
            if (i.type === 'income') continue;
            void updateItem(i.id, { type: 'transfer', category: 'Self Transfer', tags: ['Self Transfer'], review: 'mine' });
            if (i.title) void learnMerchant(i.title, 'Self Transfer', 'transfer');
        }
        clearSelection();
    };
    const bulkDelete = () => {
        if (!bulkConfirmDelete) return setBulkConfirmDelete(true);
        for (const id of selectedIds) void deleteItem(id);
        clearSelection();
    };

    const [startSplit, setStartSplit] = useState(false);
    const openAddSheet = () => {
        setStartSplit(false);
        setEditingItem(null);
        setIsSheetVisible(true);
    };

    const openEditSheet = (item: any) => {
        setStartSplit(false);
        setEditingItem(item);
        setIsSheetVisible(true);
    };

    const handleSave = async (updates: any) => {
        if (editingItem) {
            // Changing a transaction's category teaches Align that merchant's category for next time.
            // Switching it to a Transfer (family, your own account) teaches that this payee isn't spending.
            const typeChanged = updates.type && updates.type !== editingItem.type;
            if (updates.category && (updates.category !== editingItem.category || typeChanged) && (updates.title || editingItem.title)) {
                void learnMerchant(updates.title || editingItem.title, updates.category, updates.type || editingItem.type);
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
                    <SegmentedControl tabs={['Overview', 'Analysis', 'Split']} activeTab={view} onTabChange={t => setView(t as MoneyView)} />
                    <View style={{ height: 12 }} />

                    {view === 'Split' ? (
                        <>
                            <Pressable accessibilityRole="button" onPress={() => { setEditingItem(null); setStartSplit(true); setIsSheetVisible(true); }}
                                style={[styles.splitBtn, { backgroundColor: c.accentFill }]}>
                                <Users color={c.onAccent} size={18} />
                                <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 15 }}>Split a bill</Text>
                            </Pressable>
                            <FriendsCard balances={balances} history={name => friendHistory(activeGroup ? inGroup(items, activeGroup) : items, name)} onSettle={settleUp} onPay={payFriend} groups={groups} group={activeGroup} onGroup={setGroup} />
                            {!balances.some(b => Math.round(b.net * 100) !== 0) && (
                                <View style={[styles.empty, { borderColor: c.border, marginTop: 16 }]}>
                                    <Users color={c.textTertiary} size={32} />
                                    <Text style={[Type.body, { color: c.textSecondary, textAlign: 'center' }]}>
                                        {balances.length ? 'All settled up.' : 'Split a bill with friends: choose who was there, who paid, and how to divide it.'}{'\n'}Who owes whom shows up here.
                                    </Text>
                                </View>
                            )}
                        </>
                    ) : view === 'Analysis' ? (<>
                        {/* By salary cycle, or the last 90 days at once */}
                        <View style={[styles.modeSwitch, { backgroundColor: c.backgroundMuted }]}>
                            {(['cycle', '90'] as const).map(m => (
                                <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: analysisMode === m }} onPress={() => setAnalysisMode(m)}
                                    style={[styles.modeBtn, analysisMode === m && { backgroundColor: c.backgroundElement }]}>
                                    <Text style={{ color: analysisMode === m ? c.text : c.textSecondary, fontWeight: '700', fontSize: 13 }}>{m === 'cycle' ? 'By cycle' : 'Last 90 days'}</Text>
                                </Pressable>
                            ))}
                        </View>
                        {analysisMode === '90' ? (
                            <NinetyDayView items={items} config={categoryConfig} onSelectCategory={name => { setCategoryFilter(name); setTypeFilter('expense'); setView('Overview'); }} />
                        ) : (
                        <AnalysisView
                            onSelectPlace={name => { setPlaceFilter(name); setTypeFilter('expense'); setView('Overview'); }}
                            onSelectShop={name => { setQuery(name); setSearchOpen(true); setView('Overview'); }}
                            onNameSpot={(spot: Spot, name: string) => {
                                const centre = spotCentre(items as any, spot.ids);
                                if (centre) void savePlace(name, centre);
                                for (const id of spot.ids) void updateItem(id, { placeName: name });
                            }}
                            items={items}
                            payday={payday}
                            config={categoryConfig}
                            offset={offset}
                            onOffsetChange={setOffset}
                            onSelectCategory={name => { setCategoryFilter(name); setTypeFilter('expense'); setView('Overview'); }}
                        />
                        )}
                    </>) : (<>
                    {(flags.length > 0 || reported.length > 0) && (
                        <Pressable accessibilityRole="button" onPress={() => setReviewOpen(true)} style={[styles.alert, { backgroundColor: c.expenseSoft }]}>
                            <ShieldAlert color={c.expense} size={18} />
                            <Text style={{ color: c.expense, fontWeight: '700', flex: 1, fontSize: 14 }}>
                                {flags.length ? `${flags.length} payment${flags.length === 1 ? '' : 's'} to check` : `${reported.length} reported as not yours`}
                            </Text>
                            <Text style={{ color: c.expense, fontWeight: '700', fontSize: 13 }}>Review</Text>
                        </Pressable>
                    )}
                    <CycleStepper plain payday={payday} offset={offset} onChange={setOffset} />
                                        {/* Budget / balance card */}
                    <View style={[styles.hero, { backgroundColor: budget?.status === 'over' ? c.expense : c.heroFill }, Shadow.raised]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={budget ? 'Edit budget' : 'Set a monthly budget'} onPress={() => setBudgetOpen(true)}>
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
                                    {(totalEarned > 0 ? `${Math.round(spentShare * 100)}% of income spent` : `No income logged ${inProgress ? 'this cycle' : 'in this period'}`) + ' · tap to set a budget'}
                                </Text>
                            </>
                        )}

                        <View style={styles.heroLine}>
                            <View style={styles.heroLineItem}>
                                <ArrowDownLeft color={c.heroBar} size={15} strokeWidth={2.5} />
                                <Text style={[styles.heroLineText, { color: c.onHero }]}>{formatMoney(totalEarned)} in</Text>
                            </View>
                            <View style={styles.heroLineItem}>
                                <ArrowUpRight color={c.onHero} size={15} strokeWidth={2.5} />
                                <Text style={[styles.heroLineText, { color: c.onHero }]}>{formatMoney(totalSpent)} out</Text>
                            </View>
                        </View>
                    </Pressable>
                        {upcoming.length > 0 && (
                            <Pressable accessibilityRole="button" accessibilityLabel="Next payment due. Open Wallet" onPress={() => router.push('/(tabs)/wallet' as any)} style={[styles.heroNext, { borderTopColor: c.onHeroOverlay }]}>
                                <CalendarClock color={c.onHero} size={15} />
                                <Text style={[styles.heroLineText, { color: c.onHero, flex: 1, fontWeight: '600' }]} numberOfLines={1}>
                                    {upcoming[0].title}{upcoming[0].amount > 0 ? ` ${formatMoney(upcoming[0].amount)}` : ''} · {upcoming[0].tone === 'overdue' ? 'overdue' : dueLabel(upcoming[0].date)}{upcoming.length > 1 ? ` · +${upcoming.length - 1} more` : ''}
                                </Text>
                            </Pressable>
                        )}
                    </View>

                    {/* Transactions */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.sectionHeader, { color: c.textTertiary, flex: 1 }]} numberOfLines={1}>{searching ? 'All-time results' : inProgress ? 'Transactions this cycle' : `Transactions · ${periodName}`}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 }}>
                            <Pressable accessibilityRole="button" accessibilityLabel="Search transactions" accessibilityState={{ expanded: searchShown }} hitSlop={8}
                                onPress={() => { if (searchShown && !searching) setSearchOpen(false); else { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 150); } }}>
                                <Search color={searchShown ? c.accent : c.textSecondary} size={19} />
                            </Pressable>
                            <Pressable accessibilityRole="button" accessibilityLabel="Filters" accessibilityState={{ expanded: filtersShown }} hitSlop={8} onPress={() => setMoreFilters(!moreFilters)}>
                                <SlidersHorizontal color={activeFilterCount > 0 || filtersShown ? c.accent : c.textSecondary} size={19} />
                                {activeFilterCount > 0 && <View style={[styles.filterDot, { backgroundColor: c.accent }]} />}
                            </Pressable>
                        </View>
                    </View>

                    {categoriesShown && (
                        <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border, padding: 16, gap: 16, marginBottom: 12 }, Shadow.card]}>
                            {categoryTotals.length === 0 && <Text style={{ color: c.textSecondary, fontSize: 13 }}>Nothing spent yet this cycle.</Text>}
                            {categoryTotals.map(cat => {
                                const Icon = cat.icon;
                                const tint = tintColors(cat.tint, theme.isDark);
                                const share = cat.limit ? cat.amount / cat.limit : cat.amount / Math.max(totalSpent, 1);
                                const status: BudgetStatus | null = cat.limit ? budgetStatus(share) : null;
                                const barColor = status === 'over' ? c.expense : status === 'warning' ? c.warning : tint.fg;
                                const picked = categoryFilter === cat.name;
                                return (
                                    <Pressable key={cat.name} accessibilityRole="button" accessibilityState={{ selected: picked }} accessibilityLabel={`Show ${cat.name} transactions`}
                                        onPress={() => { if (picked) setCategoryFilter(null); else { setCategoryFilter(cat.name); setTypeFilter('expense'); } }}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: categoryFilter && !picked ? 0.5 : 1 }}>
                                        <View style={[styles.catIcon, { backgroundColor: tint.bg }]}>
                                            <Icon color={tint.fg} size={16} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }}>
                                                <Text style={[Type.label, { color: c.text, fontWeight: '600' }]}>{cat.name}</Text>
                                                <Text style={[Type.label, { color: status === 'over' ? c.expense : c.textSecondary, fontVariant: ['tabular-nums'] }]}>
                                                    {cat.limit ? `${formatMoney(cat.amount)} of ${formatMoney(cat.limit)}` : `${formatMoney(cat.amount)} · ${Math.round(share * 100)}%`}
                                                </Text>
                                            </View>
                                            <View style={[styles.catTrack, { backgroundColor: c.backgroundMuted }]}>
                                                <View style={{ width: `${Math.min(100, share * 100)}%`, height: '100%', backgroundColor: barColor, borderRadius: Radius.pill }} />
                                            </View>
                                        </View>
                                    </Pressable>
                                );
                            })}
                            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22 }}>
                                <Pressable accessibilityRole="button" onPress={() => setCategoriesOpen(true)} hitSlop={8}>
                                    <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>Edit categories</Text>
                                </Pressable>
                                <Pressable accessibilityRole="button" onPress={() => setBudgetOpen(true)} hitSlop={8}>
                                    <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>Limits</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}

                    {searchShown && (
                    <View style={[styles.search, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                        <Search color={c.textTertiary} size={17} />
                        <TextInput
                            ref={searchRef}
                            accessibilityLabel="Search transactions"
                            value={query}
                            onChangeText={setQuery}
                            placeholder={Platform.OS === 'web' ? 'Search by name, category or amount  (⌘K)' : 'Search by name, category or amount'}
                            placeholderTextColor={c.textTertiary}
                            style={[styles.searchInput, { color: c.text }]}
                            returnKeyType="search"
                        />
                        {query !== '' && (
                            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => { setQuery(''); setSearchOpen(false); }}>
                                <X color={c.textTertiary} size={16} />
                            </Pressable>
                        )}
                    </View>
                    )}
                    {filtersShown && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                            <Pressable accessibilityRole="button" accessibilityState={{ selected: categoriesShown }} onPress={() => setCategoriesShown(!categoriesShown)}
                                style={[styles.filterChip, categoriesShown ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                                <Text style={{ color: categoriesShown ? c.onAccent : c.text, fontWeight: '600', fontSize: 12 }}>Categories</Text>
                            </Pressable>
                            {TYPE_FILTERS.map(f => {
                                const active = typeFilter === f.key;
                                return (
                                    <Pressable key={f.key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setTypeFilter(f.key)}
                                        style={[styles.filterChip, active ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                                        <Text style={{ color: active ? c.onAccent : c.text, fontWeight: '600', fontSize: 12 }}>{f.label}</Text>
                                    </Pressable>
                                );
                            })}
                            {([
                                ['bookmarked', 'Bookmarked', 0],
                                ['excluded', 'Left out', 0],
                                ['untagged', 'Untagged', untaggedCount],
                                ['nomerchant', 'No merchant', noMerchantCount],
                            ] as [FlagFilter, string, number][]).map(([key, label, n]) => {
                                const active = flagFilters.has(key);
                                return (
                                    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => toggleFlag(key)}
                                        style={[styles.filterChip, active ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                                        <Text style={{ color: active ? c.onAccent : c.text, fontWeight: '600', fontSize: 12 }}>{label}{n > 0 ? ` · ${n}` : ''}</Text>
                                    </Pressable>
                                );
                            })}
                            <Pressable accessibilityRole="button" accessibilityLabel="Export the listed transactions as CSV" onPress={() => void exportCsv()}
                                style={[styles.filterChip, { backgroundColor: c.backgroundElement, borderColor: c.border, flexDirection: 'row', gap: 5 }]}>
                                <Download color={c.text} size={13} />
                            </Pressable>
                        </ScrollView>
                    )}
                    {placeFilter && (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${placeFilter} place filter`} onPress={() => setPlaceFilter(null)}
                            style={[styles.filterChip, { backgroundColor: c.accentSoft, borderColor: c.accentSoft, flexDirection: 'row', gap: 6, alignSelf: 'flex-start', marginBottom: 10 }]}>
                            <MapPin color={c.accent} size={14} />
                            <Text style={{ color: c.accent, fontWeight: '700', fontSize: 12 }}>{placeFilter}</Text>
                            <X color={c.accent} size={14} />
                        </Pressable>
                    )}
                    {categoryFilter && (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${categoryFilter} filter`} onPress={() => setCategoryFilter(null)}
                            style={[styles.filterChip, { backgroundColor: c.accentSoft, borderColor: c.accentSoft, flexDirection: 'row', gap: 6, alignSelf: 'flex-start', marginBottom: 10 }]}>
                            <Tags color={c.accent} size={14} />
                            <Text style={{ color: c.accent, fontWeight: '700', fontSize: 12 }}>{categoryFilter}</Text>
                            <X color={c.accent} size={14} />
                        </Pressable>
                    )}
                    {filtering && (
                        <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 10 }}>
                            {listItems.length} {listItems.length === 1 ? 'transaction' : 'transactions'} · net {listTotal < 0 ? '−' : '+'}{formatMoney(Math.abs(listTotal))}
                            {flagFilters.size > 0 && (
                                <Text onPress={() => setFlagFilters(new Set())} style={{ color: c.accent, fontWeight: '700' }}>{'  '}Reset filters</Text>
                            )}
                        </Text>
                    )}

                    {groupedTransactions.length === 0 ? (
                        <View style={[styles.empty, { borderColor: c.border }]}>
                            <Wallet color={c.textTertiary} size={32} />
                            <Text style={[Type.body, { color: c.textSecondary, textAlign: 'center' }]}>{filtering ? 'Nothing matches these filters. Try clearing one.' : <>A clean slate.{'\n'}Tap + to add your first one, or import a bank statement.</>}</Text>
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
                                          <SwipeRow key={item.id} enabled={!selecting && renamingId !== item.id} background={c.backgroundElement}
                                            rightLabel={item.bookmarked ? 'Remove bookmark' : 'Bookmark'} rightColor={c.accent} onRight={() => void updateItem(item.id, { bookmarked: !item.bookmarked })}
                                            deleteColor={c.expenseFill} onDelete={() => void deleteItem(item.id)}>
                                            <Pressable
                                                // Long-press starts selecting several; while selecting, a tap adds or removes one
                                                onPress={() => (selecting ? toggleSelected(item.id) : openEditSheet(item))}
                                                onLongPress={() => toggleSelected(item.id)}
                                                accessibilityState={{ selected: selectedIds.has(item.id) }}
                                                style={({ pressed }) => [
                                                    styles.rowItem,
                                                    { opacity: pressed ? 0.7 : 1 },
                                                    selectedIds.has(item.id) && { backgroundColor: c.accentSoft },
                                                    index !== items.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                                                ]}
                                            >
                                                <View style={[styles.iconBox, { backgroundColor: selectedIds.has(item.id) ? c.accentFill : tint.bg }]}>
                                                    {selectedIds.has(item.id) ? <Check color={c.onAccent} size={18} strokeWidth={3} /> : <Icon color={tint.fg} size={18} />}
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    {renamingId === item.id ? (
                                                        <TextInput
                                                            accessibilityLabel="Rename merchant"
                                                            value={renameText}
                                                            onChangeText={setRenameText}
                                                            autoFocus
                                                            selectTextOnFocus
                                                            returnKeyType="done"
                                                            onSubmitEditing={() => commitRename(item)}
                                                            onBlur={() => commitRename(item)}
                                                            onKeyPress={(e: any) => { if (e.nativeEvent?.key === 'Escape') setRenamingId(null); }}
                                                            style={[Type.body, { color: c.text, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: c.accent, paddingVertical: 0 }]}
                                                        />
                                                    ) : (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Pressable
                                                                accessibilityRole="menuitem"
                                                                accessibilityLabel={`Rename ${item.title}`}
                                                                disabled={selecting}
                                                                onPress={() => { setRenameText(item.title || ''); setRenamingId(item.id); }}
                                                                style={{ flexShrink: 1 }}
                                                            >
                                                                <Text style={[Type.body, { color: c.text, fontWeight: '600' }]} numberOfLines={1}>{item.title}</Text>
                                                            </Pressable>
                                                            {item.bookmarked && (
                                                                <Pressable accessibilityRole="menuitem" accessibilityLabel="Remove bookmark" hitSlop={8} onPress={() => void updateItem(item.id, { bookmarked: false })}>
                                                                    <Bookmark color={c.accent} fill={c.accent} size={14} />
                                                                </Pressable>
                                                            )}
                                                        </View>
                                                    )}
                                                    <Text style={[Type.caption, { color: c.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                                                        {(showLabels ? [category.name, splitLabel(item), item.cardLast4 ? (cardNameMap.get(item.cardLast4) || `••${item.cardLast4}`) : null, item.placeName || null, formatTime(item.time), item.autoDetected ? SOURCE_LABEL[item.source] || 'Auto' : '', item.refundOf ? 'Refund' : '', item.refunded > 0 ? `₹${item.refunded} refunded` : ''] : [category.name, formatTime(item.time)]).filter(Boolean).join(' · ')}
                                                    </Text>
                                                    {showLabels && (item.note || item.tags?.length) ? <Text style={[Type.caption, { color: c.textSecondary, marginTop: 1 }]} numberOfLines={1}>{[item.note, ...(item.tags || []).map((x: string) => `#${x}`)].filter(Boolean).join(' · ')}</Text> : null}
                                                </View>
                                                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                                                    <Text style={[Type.body, { color: isIncome ? c.income : (isTransfer ? c.textSecondary : c.text), fontWeight: '700', fontVariant: ['tabular-nums'] }]}>
                                                        {isTransfer ? '' : (isIncome ? '+' : '−')}{formatMoney(Number(item.amount) || 0)}
                                                    </Text>
                                                    {/* Kind of transaction at a glance */}
                                                    {showLabels && (isTransfer || item.excluded) && <View style={[styles.kindTag, { backgroundColor: item.excluded ? c.backgroundMuted : isIncome ? c.incomeSoft : isTransfer ? c.backgroundMuted : c.expenseSoft }]}>
                                                        <Text style={[styles.kindTagText, { color: item.excluded ? c.textSecondary : isIncome ? c.income : isTransfer ? c.textSecondary : c.expense }]}>
                                                            {item.excluded ? 'Left out' : isIncome ? 'Income' : isTransfer ? 'Transfer' : 'Expense'}
                                                        </Text>
                                                    </View>}
                                                </View>
                                            </Pressable>
                                          </SwipeRow>
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
            {selecting && (
                <View style={[styles.bulkBar, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.raised]}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Stop selecting" onPress={clearSelection} hitSlop={8} style={styles.bulkIcon}>
                        <X color={c.textSecondary} size={18} />
                    </Pressable>
                    <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{selectedIds.size} selected</Text>
                    <Pressable accessibilityRole="button" onPress={() => setBulkCategoryPickerVisible(true)} style={[styles.bulkBtn, { backgroundColor: c.accentSoft }]}>
                        <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>Category</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={bulkTransfer} style={[styles.bulkBtn, { backgroundColor: c.backgroundMuted }]}>
                        <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>Transfer</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={bulkConfirmDelete ? `Tap again to delete ${selectedIds.size}` : 'Delete selected'} onPress={bulkDelete}
                        style={[styles.bulkBtn, { backgroundColor: bulkConfirmDelete ? c.expense : c.expenseSoft }]}>
                        <Text style={{ color: bulkConfirmDelete ? '#FFFFFF' : c.expense, fontWeight: '700', fontSize: 13 }}>{bulkConfirmDelete ? 'Delete?' : 'Delete'}</Text>
                    </Pressable>
                </View>
            )}
            <Modal visible={bulkCategoryPickerVisible} transparent animationType="fade" onRequestClose={() => setBulkCategoryPickerVisible(false)}>
                <Pressable style={styles.bulkBackdrop} onPress={() => setBulkCategoryPickerVisible(false)}>
                    <Pressable style={[styles.bulkSheet, { backgroundColor: c.background }]} onPress={() => {}}>
                        <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>Category for {selectedIds.size} transaction{selectedIds.size === 1 ? '' : 's'}</Text>
                        <CategoryPicker kind="expense" value="" onChange={bulkCategorize} />
                    </Pressable>
                </Pressable>
            </Modal>
            <ReviewSheet
                visible={reviewOpen}
                flags={flags}
                reported={reported}
                onClose={() => setReviewOpen(false)}
                onReview={(item, review) => void updateItem(item.id, { review })}
                onTransfer={(item, category) => {
                    void updateItem(item.id, { type: 'transfer', category, tags: [category], review: 'mine' });
                    void learnMerchant(item.title, category, 'transfer');
                }}
            />
            <TransactionSheet
                visible={isSheetVisible}
                item={editingItem}
                onClose={() => setIsSheetVisible(false)}
                onSave={handleSave}
                onDelete={deleteItem}
                items={items}
                awareness={(cat, amt) => {
                    const limit = categoryBudgets(limits)[cat] || 0;
                    if (!limit || !(amt > 0)) return null;
                    const used = categoryTotals.find(t => t.name === cat)?.amount || 0;
                    const after = used + amt;
                    const left = limit - after;
                    return left >= 0
                        ? `${cat}: ${formatMoney(used)} of ${formatMoney(limit)} used. This leaves ${formatMoney(left)} (${Math.round((after / limit) * 100)}%).`
                        : `${cat}: this puts you ${formatMoney(-left)} over its ${formatMoney(limit)} budget.`;
                }}
                onPatchItem={updateItem}
                friends={friends}
                groups={groups.map(g => g.name)}
                groupDrafts={groupDrafts}
                startSplit={startSplit}
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
  heroNext: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  filterDot: { position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 4 },
  heroLine: { flexDirection: 'row', gap: 18, marginTop: 14 },
  heroLineItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroLineText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md },
  heroStatIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  heroStatLabel: { fontSize: 12, fontWeight: '600' },
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
  filters: { gap: 6, paddingBottom: 10 },
  filterChip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: Radius.pill, borderWidth: 1, alignItems: 'center' },
  kindTag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: Radius.pill },
  kindTagText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: Radius.md, marginBottom: 10 },
  modeSwitch: { flexDirection: 'row', borderRadius: Radius.md, padding: 3, marginBottom: 12 },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm },
  bulkBar: { position: 'absolute', left: 12, right: 12, bottom: 96, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: Radius.lg, borderWidth: 1 },
  bulkIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  bulkBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill },
  bulkBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  bulkSheet: { borderRadius: Radius.xl, padding: 20, gap: 14, width: '100%', maxWidth: 480, alignSelf: 'center' },
  splitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: Radius.md },
  empty: { padding: 32, alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
});
