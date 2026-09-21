const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

code = code.replace(/const \{ items, updateItem, deleteItem, addExpense \} = usePlannerItems\(phone\);/, "const { items, updateItem, deleteItem, addItem } = usePlannerItems(phone);");
code = code.replace(/await addExpense\(\{ \.\.\.updates, id: Date\.now\(\)\.toString\(\) \}\);/, "await addItem(updates);");

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Patched finance.tsx with addItem');
