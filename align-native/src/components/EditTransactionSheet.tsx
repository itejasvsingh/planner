import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Colors, Radius, Shadow, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { X, Trash2 } from 'lucide-react-native';
import { useState, useEffect } from 'react';

interface EditTransactionSheetProps {
    visible: boolean;
    onClose: () => void;
    item: any;
    onSave: (updates: any) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

export default function EditTransactionSheet({ visible, onClose, item, onSave, onDelete }: EditTransactionSheetProps) {
    const { isDark } = useTheme();
    const c = isDark ? Colors.dark : Colors.light;

    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [date, setDate] = useState('');

    useEffect(() => {
        if (item) {
            setTitle(item.title || '');
            setAmount(item.amount ? String(item.amount) : '');
            setCategory(item.category || '');
            setDate(item.date || '');
        }
    }, [item]);

    const handleSave = async () => {
        await onSave({
            title,
            amount: parseFloat(amount) || 0,
            category,
            date
        });
        onClose();
    };

    const handleDelete = async () => {
        if (!item || item.id === 'new') { onClose(); return; }

        await onDelete(item.id);
        onClose();
    };

    

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: c.background, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 50 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <Text style={[Type.title, { color: c.text }]}>Edit Transaction</Text>
                        <Pressable onPress={onClose} style={{ padding: 8, backgroundColor: c.backgroundElement, borderRadius: Radius.pill }}>
                            <X color={c.text} size={20} />
                        </Pressable>
                    </View>

                    <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Amount</Text>
                    <TextInput 
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                        style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 24, fontWeight: '700', marginBottom: 16 }}
                    />

                    <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Title</Text>
                    <TextInput 
                        value={title}
                        onChangeText={setTitle}
                        style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 16, marginBottom: 16 }}
                    />

                    <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Category</Text>
                    <TextInput 
                        value={category}
                        onChangeText={setCategory}
                        style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 16, marginBottom: 16 }}
                    />
                    
                    <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Date (YYYY-MM-DD)</Text>
                    <TextInput 
                        value={date}
                        onChangeText={setDate}
                        style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 16, marginBottom: 24 }}
                    />

                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <Pressable onPress={handleDelete} style={{ flex: 1, backgroundColor: c.expenseSoft, padding: 16, borderRadius: Radius.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                            <Trash2 color={c.expense} size={18} />
                            <Text style={[Type.label, { color: c.expense, fontWeight: '600' }]}>Delete</Text>
                        </Pressable>
                        <Pressable onPress={handleSave} style={{ flex: 2, backgroundColor: c.accent, padding: 16, borderRadius: Radius.md, alignItems: 'center' }}>
                            <Text style={[Type.label, { color: '#FFF', fontWeight: '600' }]}>Save Changes</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
