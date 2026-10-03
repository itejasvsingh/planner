import { Modal, View, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Colors, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { X, Trash2 } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import SegmentedControl from './SegmentedControl';
import { DEFAULT_CATEGORY, kindForType, resolveCategory, type CategoryKind } from '@/lib/categories';
import CategoryPicker from './CategoryPicker';
import { DatePick } from './form/QuickPick';
import SplitSection from './SplitSection';
import { buildSplit, draftFrom, emptyDraft, splitOf, type SplitDraft } from '@/lib/splits';
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

interface TransactionSheetProps {
    visible: boolean;
    onClose: () => void;
    item: any | null; // null means adding a new item
    /** Friends you've split with, most recent first. */
    friends?: string[];
    onSave: (updates: any) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

export default function TransactionSheet({ visible, onClose, item, onSave, onDelete, friends = [] }: TransactionSheetProps) {
    const { isDark } = useTheme();
    const c = isDark ? Colors.dark : Colors.light;
    const { config: categoryConfig, merchantCategory } = useCategoryConfig();
    // Once you pick a category yourself, typing a known merchant doesn't change it
    const [categoryTouched, setCategoryTouched] = useState(false);

    const [type, setType] = useState('expense');
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState(DEFAULT_CATEGORY.expense);
        const [date, setDate] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [isSplit, setIsSplit] = useState(false);
    const [splitDraft, setSplitDraft] = useState<SplitDraft>(emptyDraft);


    useEffect(() => {
        if (visible) {
            setCategoryTouched(!!item);
            if (item) {
                setType(kindForType(item.type));
                setTitle(item.title || '');
                const split = splitOf(item);
                // A split expense keeps your share as its amount; the form edits the whole bill.
                setAmount(split ? String(split.total) : item.amount ? String(item.amount) : '');
                setCategory(resolveCategory(item.category, kindForType(item.type), categoryConfig).name);
                setDate(item.date || dateToKey(new Date()));
                setIsRecurring(!!item.isRecurring);
                setIsSplit(!!split);
                setSplitDraft(split ? draftFrom(split) : emptyDraft());
            } else {
                setType('expense');
                setTitle('');
                setAmount('');
                setCategory(DEFAULT_CATEGORY.expense);
                setDate(dateToKey(new Date()));
                setIsRecurring(false);
                setIsSplit(false);
                setSplitDraft(emptyDraft());
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

    const splitInvalid = isSplit && type === 'expense' && !!buildSplit(parseFloat(amount) || 0, splitDraft).error;
    const canSave = !!amount && !!title && !splitInvalid;

    const handleSave = async () => {
        if (!amount || !title) return; // Basic validation
        
        const finalAmount = parseFloat(amount) || 0;
        const splitting = isSplit && type === 'expense';
        const built = splitting ? buildSplit(finalAmount, splitDraft, item ? splitOf(item) : null) : null;
        if (built?.error) return; // shown under the split

        await onSave({
            type,
            title,
            amount: built?.split ? built.split.yourShare : finalAmount,
            category,
            date,
            isRecurring,
            ...(isRecurring ? { recurringFrequency: 'monthly' } : {}),
            // Turning a split off clears it, including older shapes
            ...(built?.split ? { split: built.split, splits: [] } : item && splitOf(item) ? { split: null, splits: [] } : {}),
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
                // Android resizes the window for the keyboard itself; shifting again made the whole sheet jump
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            >
                <View style={{ backgroundColor: c.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '92%' }}>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={[Type.title, { color: c.text }]}>{item ? 'Edit Transaction' : 'New Transaction'}</Text>
                        <Pressable onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: c.backgroundMuted, borderRadius: Radius.pill }}>
                            <X color={c.textSecondary} size={18} />
                        </Pressable>
                    </View>

                    <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 4 }}>
                        <SegmentedControl 
                            tabs={['Expense', 'Income', 'Transfer']} 
                            activeTab={type === 'expense' ? 'Expense' : (type === 'transfer' ? 'Transfer' : 'Income')} 
                            onTabChange={(t) => setType(t.toLowerCase())} 
                        />

                        {/* Huge Amount Input */}
                        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                            <Text style={[Type.caption, { color: c.textTertiary, marginBottom: 4 }]}>Amount</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[Type.displayLg, { fontSize: 28, color: type === 'income' ? c.income : (type === 'transfer' ? c.textSecondary : c.text), marginRight: 4 }]}>₹</Text>
                                <TextInput 
                                    accessibilityLabel="Amount"
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={c.textTertiary}
                                    style={[Type.displayLg, { fontSize: 28, color: type === 'income' ? c.income : (type === 'transfer' ? c.textSecondary : c.text), width: Math.max(44, (amount || '0').length * 18 + 14), textAlign: 'center', padding: 0, marginRight: 22 }]}
                                />
                            </View>
                        </View>

                        {/* Title */}
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
                                style={{ backgroundColor: c.backgroundElement, borderWidth: 1, borderColor: c.border, color: c.text, paddingHorizontal: 14, paddingVertical: 11, borderRadius: Radius.md, fontSize: 16 }}
                            />
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
                                        <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>Split with friends</Text>
                                        <Text style={[Type.caption, { color: c.textTertiary }]}>Share the bill; only your part counts as spent</Text>
                                    </View>
                                    <Pressable 
                                        accessibilityRole="switch"
                                        accessibilityLabel="Split with friends"
                                        accessibilityState={{ checked: isSplit }}
                                        onPress={() => setIsSplit(!isSplit)}
                                        style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: isSplit ? c.accentFill : c.backgroundMuted, padding: 2, justifyContent: 'center', alignItems: isSplit ? 'flex-end' : 'flex-start' }}
                                    >
                                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }} />
                                    </Pressable>
                                </View>

                                {isSplit && (
                                    <SplitSection total={parseFloat(amount) || 0} draft={splitDraft} onChange={setSplitDraft} recent={friends} />
                                )}
                            </View>
                        )}
                        
                    </ScrollView>

                    {/* Actions: always visible below the form */}

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                        {item && (
                            <Pressable onPress={handleDelete} style={{ flex: 1, backgroundColor: c.expenseSoft, padding: 14, borderRadius: Radius.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                                <Trash2 color={c.expense} size={18} />
                            </Pressable>
                        )}
                        <Pressable 
                            onPress={handleSave} 
                            style={{ flex: item ? 3 : 1, backgroundColor: canSave ? c.accentFill : c.backgroundMuted, padding: 14, borderRadius: Radius.md, alignItems: 'center' }}
                            disabled={!canSave}
                        >
                            <Text style={[Type.label, { color: canSave ? c.onAccent : c.textTertiary, fontWeight: '700', fontSize: 15 }]}>
                                {item ? 'Save Changes' : 'Add Transaction'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
