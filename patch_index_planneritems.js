const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');

code = code.replace(/const \{ items, loading, error, toggleDone, deleteItem, addItem, refresh \} = usePlannerItems\(phone\);/, 
    "const { items, loading, error, toggleDone, deleteItem, addItem, refresh, updateItem } = usePlannerItems(phone);");

fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', code);
console.log('Fixed usePlannerItems');
