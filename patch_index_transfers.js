const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');

code = code.replace(/const dailyFinances = items\.filter\(item => \(item\.type === 'expense' \|\| item\.type === 'income'\) && item\.date === dateKey\);/, 
    "const dailyFinances = items.filter(item => (item.type === 'expense' || item.type === 'income' || item.type === 'transfer') && item.date === dateKey);");

fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', code);
console.log('Patched index.tsx with transfers');
