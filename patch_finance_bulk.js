const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

// Add imports
code = code.replace(/import \{ View, Text, ScrollView, StyleSheet, Pressable \} from 'react-native';/, 
    "import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';");
code = code.replace(/import \{ ArrowDownRight, ArrowUpRight, Plus, Coffee, ShoppingBag, Car, Zap, Heart, Ticket, Wallet, Briefcase \} from 'lucide-react-native';/, 
    "import { ArrowDownRight, ArrowUpRight, Plus, Coffee, ShoppingBag, Car, Zap, Heart, Ticket, Wallet, Briefcase, Trash2, FolderSync, RefreshCw, X } from 'lucide-react-native';");

// Add bulk state
code = code.replace(/const \[isSheetVisible, setIsSheetVisible\] = useState\(false\);/, 
    "const [isSheetVisible, setIsSheetVisible] = useState(false);\n    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());\n    const [bulkCategoryPickerVisible, setBulkCategoryPickerVisible] = useState(false);");

// Selection logic
const openEditSheet = `    const openEditSheet = (item: any) => {
        if (selectedIds.size > 0) {
            toggleSelection(item.id);
            return;
        }
        setEditingItem(item);
        setIsSheetVisible(true);
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBulkDelete = () => {
        Alert.alert('Delete Transactions', \`Are you sure you want to delete \${selectedIds.size} transactions?\`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                await Promise.all(Array.from(selectedIds).map(id => deleteItem(id)));
                setSelectedIds(new Set());
            }}
        ]);
    };

    const handleBulkTransfer = async () => {
        await Promise.all(Array.from(selectedIds).map(id => updateItem(id, { type: 'transfer' })));
        setSelectedIds(new Set());
    };

    const handleBulkCategorize = async (newCategory: string) => {
        await Promise.all(Array.from(selectedIds).map(id => updateItem(id, { category: newCategory })));
        setBulkCategoryPickerVisible(false);
        setSelectedIds(new Set());
    };
`;
code = code.replace(/    const openEditSheet = \(item: any\) => \{\n        setEditingItem\(item\);\n        setIsSheetVisible\(true\);\n    \};/, openEditSheet);

// Transaction Item Rendering
const oldPressable = `<Pressable 
                                            key={item.id}
                                            onPress={() => openEditSheet(item)}
                                            style={({ pressed }) => [
                                                styles.rowItem,
                                                { opacity: pressed ? 0.7 : 1 },
                                                index !== items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
                                            ]}
                                        >`;
const newPressable = `<Pressable 
                                            key={item.id}
                                            onPress={() => openEditSheet(item)}
                                            onLongPress={() => toggleSelection(item.id)}
                                            style={({ pressed }) => [
                                                styles.rowItem,
                                                { opacity: pressed ? 0.7 : 1, backgroundColor: selectedIds.has(item.id) ? c.accentSoft : 'transparent' },
                                                index !== items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
                                            ]}
                                        >`;
code = code.replace(oldPressable, newPressable);

// Bulk Action Bar & Category Picker Modal
const bulkUI = `
            {selectedIds.size > 0 && (
                <View style={{ position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: c.text, padding: 16, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...Shadow.raised }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Pressable onPress={() => setSelectedIds(new Set())} style={{ padding: 8, backgroundColor: c.background, borderRadius: 12 }}>
                            <X color={c.text} size={16} />
                        </Pressable>
                        <Text style={[Type.body, { color: c.background, fontWeight: '700' }]}>{selectedIds.size} Selected</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable onPress={() => setBulkCategoryPickerVisible(true)} style={{ padding: 12, backgroundColor: c.background, borderRadius: 12 }}>
                            <FolderSync color={c.text} size={18} />
                        </Pressable>
                        <Pressable onPress={handleBulkTransfer} style={{ padding: 12, backgroundColor: c.background, borderRadius: 12 }}>
                            <RefreshCw color={c.text} size={18} />
                        </Pressable>
                        <Pressable onPress={handleBulkDelete} style={{ padding: 12, backgroundColor: c.expenseSoft, borderRadius: 12 }}>
                            <Trash2 color={c.expense} size={18} />
                        </Pressable>
                    </View>
                </View>
            )}

            {bulkCategoryPickerVisible && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24, zIndex: 100 }}>
                    <View style={{ backgroundColor: c.background, borderRadius: 24, padding: 24 }}>
                        <Text style={[Type.title, { color: c.text, marginBottom: 16 }]}>Change Category</Text>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                            {['Food Delivery', 'Cabs', 'Festival Shopping', 'Mobile Recharge', 'Maid/Help', 'Salary', 'Other'].map(cat => (
                                <Pressable key={cat} onPress={() => handleBulkCategorize(cat)} style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
                                    <Text style={[Type.body, { color: c.text }]}>{cat}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                        <Pressable onPress={() => setBulkCategoryPickerVisible(false)} style={{ marginTop: 24, alignItems: 'center', padding: 16, backgroundColor: c.backgroundElement, borderRadius: 12 }}>
                            <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>Cancel</Text>
                        </Pressable>
                    </View>
                </View>
            )}
`;

code = code.replace(/<TransactionSheet /, bulkUI + "\n            <TransactionSheet ");

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Patched bulk editing');
