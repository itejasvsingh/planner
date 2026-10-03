import { Modal, View, Text, TextInput, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Colors, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { X, Trash2 } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import SegmentedControl from './SegmentedControl';
import { DEFAULT_CATEGORY, kindForType, resolveCategory, type CategoryKind } from '@/lib/categories';
import CategoryPicker from './CategoryPicker';
import { DatePick } from './form/QuickPick';
import { useCategoryConfig } from '@/lib/use-category-config';

const pad = (n: number) => String(n).padStart(2, '0');
const dateToKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = (k: string) => {
    const [y, m, d] = (k || dateToKey(new Date())).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};
const formatClock = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};
const SOURCE_NAME: Record<string, string> = { sms: 'SMS', email: 'email', gmail: 'Gmail', statement: 'a statement' };

/** A merchant you used recently, for one-tap filling when adding. */
export type MerchantSuggestion = { title: string; category: string; type: string };

interface TransactionSheetProps {
    visible: boolean;
    onClose: () => void;
    item: any | null; // null means adding a new item
    /** Recent merchants, most used first (adding only). */
    suggestions?: MerchantSuggestion[];
    onSave: (updates: any) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

export default function TransactionSheet({ visible, onClose, item, onSave, onDelete, suggestions = [] }: TransactionSheetProps) {
    const { isDark } = useTheme();
    const c = isDark ? Colors.dark : Colors.light;
    const { config: categoryConfig, merchantCategory } = useCategoryConfig();
    // Once you pick a category yourself, typing or suggestions don't change it
    const [categoryTouched, setCategoryTouched] = useState(false);

    const [type, setType] = useState('expense');
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState(DEFAULT_CATEGORY.expense);
        const [date, setDate] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [isSplit, setIsSplit] = useState(false);
    const [splitWith, setSplitWith] = useState('');
    const [paidByYou, setPaidByYou] = useState(true);
    const [yourShareStr, setYourShareStr] = useState('');

    // Recent places for this type, narrowed as you type (hidden once the title matches one exactly)
    const typed = title.trim().toLowerCase();
    const visibleSuggestions = suggestions
        .filter(sg => kindForType(sg.type) === type)
        .filter(sg => !typed || (sg.title.toLowerCase().includes(typed) && sg.title.toLowerCase() !== typed))
        .slice(0, 6);

    useEffect(() => {
        if (visible) {
            setCategoryTouched(!!item);
            if (item) {
                setType(kindForType(item.type));
                setTitle(item.title || '');
                setAmount(item.amount ? String(item.amount) : '');
                setCategory(resolveCategory(item.category, kindForType(item.type), categoryConfig).name);
                setDate(item.date || dateToKey(new Date()));
                setIsRecurring(!!item.isRecurring);
                setIsSplit(!!item.split);
                if (item.split) {
                    setSplitWith(item.split.splitWith || '');
                    setPaidByYou(item.split.paidBy === 'you');
                    setYourShareStr(String(item.split.yourShare || 0));
                }
            } else {
                setType('expense');
                setTitle('');
                setAmount('');
                setCategory(DEFAULT_CATEGORY.expense);
                setDate(dateToKey(new Date()));
                setIsRecurring(false);
                setIsSplit(false);
                setSplitWith('');
                setPaidByYou(true);
                setYourShareStr('');
            }
        }
        // Category config is read only when the sheet opens; re-running on a background sync would reset the form.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, item]);

    // Update default category when type changes
    useEffect(() => {
        if (!item) {
            setCategory(DEFAULT_CATEGORY[type as CategoryKind] ?? DEFAULT_CATEGORY.expense);
        }
    }, [type, item]);

    const handleSave = async () => {
        if (!amount || !title) return; // Basic validation
        
        const finalAmount = parseFloat(amount) || 0;
        let splitData = null;
        if (isSplit && splitWith) {
            splitData = {
                totalAmount: finalAmount,
                splitWith,
                yourShare: parseFloat(yourShareStr) || (finalAmount / 2),
                paidBy: paidByYou ? 'you' : 'them',
                settled: false
            };
        }
        
        await onSave({
            type,
            title,
            amount: isSplit ? (parseFloat(yourShareStr) || (finalAmount / 2)) : finalAmount,
            category,
            date,
            isRecurring,
            ...(isRecurring ? { recurringFrequency: 'monthly' } : {}),
            ...(splitData ? { split: splitData } : {})
        });
        onClose();
    };

    const handleDelete = async () => {
        if (item && item.id && onDelete) {
            await onDelete(item.id);
        }
        onClose();
    };


    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            >
                <View style={{ backgroundColor: c.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 44, maxHeight: '90%' }}>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <Text style={[Type.title, { color: c.text }]}>{item ? 'Edit Transaction' : 'New Transaction'}</Text>
                        <Pressable onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: c.backgroundMuted, borderRadius: Radius.pill }}>
                            <X color={c.textSecondary} size={18} />
                        </Pressable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20 }}>
                        <SegmentedControl 
                            tabs={['Expense', 'Income', 'Transfer']} 
                            activeTab={type === 'expense' ? 'Expense' : (type === 'transfer' ? 'Transfer' : 'Income')} 
                            onTabChange={(t) => setType(t.toLowerCase())} 
                        />

                        {/* Huge Amount Input */}
                        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                            <Text style={[Type.caption, { color: c.textTertiary, marginBottom: 8 }]}>Amount</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[Type.displayLg, { color: type === 'income' ? c.income : (type === 'transfer' ? c.textSecondary : c.text), marginRight: 4 }]}>₹</Text>
                                <TextInput 
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={c.textTertiary}
                                    style={[Type.displayLg, { color: type === 'income' ? c.income : (type === 'transfer' ? c.textSecondary : c.text), minWidth: 60, width: 160, textAlign: 'left' }]}
                                    autoFocus={!item}
                                />
                            </View>
                        </View>

                        {/* Title, with your recent merchants one tap away when adding */}
                        <View style={{ gap: 8 }}>
                            <Text style={[Type.label, { color: c.textSecondary }]}>Title</Text>
                            <TextInput
                                accessibilityLabel="Title"
                                value={title}
                                onChangeText={(t) => {
                                    setTitle(t);
                                    // A merchant you've categorised before brings its category along
                                    const mine = merchantCategory(t);
                                    if (mine && !categoryTouched) setCategory(mine);
                                }}
                                placeholder="What was this for?"
                                placeholderTextColor={c.textTertiary}
                                style={{ backgroundColor: c.backgroundElement, borderWidth: 1, borderColor: c.border, color: c.text, padding: 14, borderRadius: Radius.md, fontSize: 16 }}
                            />
                            {!item && type !== 'transfer' && visibleSuggestions.length > 0 ? (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    {visibleSuggestions.map(sg => (
                                        <Pressable
                                            key={sg.title}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Use ${sg.title}`}
                                            onPress={() => {
                                                setTitle(sg.title);
                                                if (!categoryTouched) setCategory(merchantCategory(sg.title) || sg.category);
                                            }}
                                            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: c.backgroundMuted }}
                                        >
                                            <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{sg.title}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            ) : null}
                        </View>

                        <View style={{ gap: 8 }}>
                            <Text style={[Type.label, { color: c.textSecondary }]}>Date</Text>
                            <DatePick value={keyToDate(date)} onChange={d => setDate(dateToKey(d))} mode="past" />
                            {item?.autoDetected ? (
                                <Text style={{ color: c.textTertiary, fontSize: 12 }}>
                                    {[item.time ? `Recorded at ${formatClock(item.time)}` : 'Recorded automatically', SOURCE_NAME[item.source] ? `from ${SOURCE_NAME[item.source]}` : '', item.ref ? `· ref ${item.ref}` : ''].filter(Boolean).join(' ')}
                                </Text>
                            ) : null}
                        </View>

                        {/* Category Selector */}
                        <View>
                            <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Category</Text>
                            <CategoryPicker kind={kindForType(type)} value={category} onChange={(v) => { setCategory(v); setCategoryTouched(true); }} />
                        </View>

                        
                        {/* Advanced Features */}
                        {type === 'expense' && (
                            <View style={{ backgroundColor: c.backgroundElement, borderWidth: 1, borderColor: c.border, borderRadius: Radius.lg, padding: 16, gap: 16 }}>
                                {/* Recurring Toggle */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>Monthly Bill</Text>
                                        <Text style={[Type.caption, { color: c.textTertiary }]}>Remind me and auto-log this</Text>
                                    </View>
                                    <Pressable 
                                        onPress={() => setIsRecurring(!isRecurring)}
                                        style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: isRecurring ? c.accentFill : c.backgroundMuted, padding: 2, justifyContent: 'center', alignItems: isRecurring ? 'flex-end' : 'flex-start' }}
                                    >
                                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }} />
                                    </Pressable>
                                </View>

                                {/* Split Toggle */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>Split with Friends</Text>
                                        <Text style={[Type.caption, { color: c.textTertiary }]}>Track who owes what</Text>
                                    </View>
                                    <Pressable 
                                        onPress={() => setIsSplit(!isSplit)}
                                        style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: isSplit ? c.accentFill : c.backgroundMuted, padding: 2, justifyContent: 'center', alignItems: isSplit ? 'flex-end' : 'flex-start' }}
                                    >
                                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }} />
                                    </Pressable>
                                </View>

                                {/* Split Details */}
                                {isSplit && (
                                    <View style={{ marginTop: 8, gap: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 16 }}>
                                        <TextInput 
                                            value={splitWith}
                                            onChangeText={setSplitWith}
                                            placeholder="Friend's Name"
                                            placeholderTextColor={c.textTertiary}
                                            style={{ backgroundColor: c.backgroundMuted, color: c.text, padding: 12, borderRadius: Radius.md }}
                                        />
                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            <Pressable 
                                                onPress={() => setPaidByYou(true)}
                                                style={{ flex: 1, padding: 12, borderRadius: Radius.md, backgroundColor: paidByYou ? c.accentFill : c.backgroundMuted, alignItems: 'center' }}
                                            >
                                                <Text style={[Type.caption, { color: paidByYou ? c.onAccent : c.textSecondary, fontWeight: '700' }]}>You Paid</Text>
                                            </Pressable>
                                            <Pressable 
                                                onPress={() => setPaidByYou(false)}
                                                style={{ flex: 1, padding: 12, borderRadius: Radius.md, backgroundColor: !paidByYou ? c.accentFill : c.backgroundMuted, alignItems: 'center' }}
                                            >
                                                <Text style={[Type.caption, { color: !paidByYou ? c.onAccent : c.textSecondary, fontWeight: '700' }]}>They Paid</Text>
                                            </Pressable>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <Text style={[Type.caption, { color: c.textSecondary, flex: 1 }]}>Your Share Amount:</Text>
                                            <TextInput 
                                                value={yourShareStr}
                                                onChangeText={setYourShareStr}
                                                placeholder={amount ? String(parseFloat(amount) / 2) : "0.00"}
                                                keyboardType="decimal-pad"
                                                placeholderTextColor={c.textTertiary}
                                                style={{ backgroundColor: c.backgroundMuted, color: c.text, padding: 12, borderRadius: Radius.md, flex: 1 }}
                                            />
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                        
                        {/* Actions */}

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                            {item && (
                                <Pressable onPress={handleDelete} style={{ flex: 1, backgroundColor: c.expenseSoft, padding: 16, borderRadius: Radius.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                                    <Trash2 color={c.expense} size={18} />
                                </Pressable>
                            )}
                            <Pressable 
                                onPress={handleSave} 
                                style={{ flex: item ? 3 : 1, backgroundColor: (amount && title) ? c.accentFill : c.backgroundMuted, padding: 16, borderRadius: Radius.md, alignItems: 'center' }}
                                disabled={!amount || !title}
                            >
                                <Text style={[Type.label, { color: (amount && title) ? c.onAccent : c.textTertiary, fontWeight: '700', fontSize: 15 }]}>
                                    {item ? 'Save Changes' : 'Add Transaction'}
                                </Text>
                            </Pressable>
                        </View>

                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
