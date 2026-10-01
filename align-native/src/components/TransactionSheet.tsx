import { Modal, View, Text, TextInput, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { Colors, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { X, Trash2 } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import SegmentedControl from './SegmentedControl';
import { categoriesFor, DEFAULT_CATEGORY, kindForType, resolveCategory, tintColors, type CategoryKind } from '@/lib/categories';
import { useCategoryConfig } from '@/lib/use-category-config';

interface TransactionSheetProps {
    visible: boolean;
    onClose: () => void;
    item: any | null; // null means adding a new item
    onSave: (updates: any) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

export default function TransactionSheet({ visible, onClose, item, onSave, onDelete }: TransactionSheetProps) {
    const { isDark } = useTheme();
    const c = isDark ? Colors.dark : Colors.light;
    const { config: categoryConfig } = useCategoryConfig();

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

    useEffect(() => {
        if (visible) {
            if (item) {
                setType(kindForType(item.type));
                setTitle(item.title || '');
                setAmount(item.amount ? String(item.amount) : '');
                setCategory(resolveCategory(item.category, kindForType(item.type), categoryConfig).name);
                setDate(item.date || new Date().toISOString().split('T')[0]);
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
                setDate(new Date().toISOString().split('T')[0]);
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

    const categories = categoriesFor(kindForType(type), categoryConfig);

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

                        {/* Title & Date Row */}
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <View style={{ flex: 2 }}>
                                <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Title</Text>
                                <TextInput 
                                    value={title}
                                    onChangeText={setTitle}
                                    placeholder="What was this for?"
                                    placeholderTextColor={c.textTertiary}
                                    style={{ backgroundColor: c.backgroundElement, borderWidth: 1, borderColor: c.border, color: c.text, padding: 14, borderRadius: Radius.md, fontSize: 16 }}
                                />
                            </View>
                            <View style={{ flex: 1.5 }}>
                                <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Date</Text>
                                <TextInput 
                                    value={date}
                                    onChangeText={setDate}
                                    style={{ backgroundColor: c.backgroundElement, borderWidth: 1, borderColor: c.border, color: c.text, padding: 14, borderRadius: Radius.md, fontSize: 16 }}
                                />
                            </View>
                        </View>

                        {/* Category Selector */}
                        <View>
                            <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Category</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
                                {categories.map(cat => {
                                    const isSelected = category === cat.name;
                                    const Icon = cat.icon;
                                    return (
                                        <Pressable 
                                            key={cat.name} 
                                            onPress={() => setCategory(cat.name)}
                                            style={[{ 
                                                flexDirection: 'row', alignItems: 'center', gap: 8, 
                                                paddingHorizontal: 16, paddingVertical: 12, 
                                                borderRadius: Radius.pill,
                                                borderWidth: 1,
                                                borderColor: c.border,
                                                backgroundColor: c.backgroundElement
                                            }, isSelected && { backgroundColor: c.accentFill, borderColor: c.accentFill }]}
                                        >
                                            <Icon color={isSelected ? c.onAccent : tintColors(cat.tint, isDark).fg} size={17} />
                                            <Text style={[Type.body, { fontWeight: isSelected ? '700' : '500', color: isSelected ? c.onAccent : c.text }]}>
                                                {cat.name}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
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
