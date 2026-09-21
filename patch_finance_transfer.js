const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

// Filter only finance items including transfer
code = code.replace(/i\.type === 'deposit'\)/, "i.type === 'deposit' || i.type === 'transfer')");

// Incomes should NOT include transfers
code = code.replace(/const incomes = financeItems\.filter\(i => i\.type !== 'expense'\);/, "const incomes = financeItems.filter(i => i.type !== 'expense' && i.type !== 'transfer');");

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Patched finance transfer');
