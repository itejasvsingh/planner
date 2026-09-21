const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

if (!code.includes('addExpense')) {
    code = code.replace(/const \{ items, updateItem, deleteItem \} = usePlannerItems\(phone\);/, "const { items, updateItem, deleteItem, addExpense } = usePlannerItems(phone);");
}

const saveLogic = `            onSave={async (updates) => {
                if (editingItem) {
                    if (editingItem.id === 'new') {
                        await addExpense({ ...updates, date: updates.date || new Date().toISOString().split('T')[0] });
                    } else {
                        await updateItem(editingItem.id, updates);
                    }
                }
            }}`;

code = code.replace(/onSave=\{async \(updates\) => \{\s*if \(editingItem\) await updateItem\(editingItem\.id, updates\);\s*\}\}/, saveLogic);

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Fixed onSave logic');
