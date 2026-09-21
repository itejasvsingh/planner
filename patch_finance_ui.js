const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

code = code.replace(/const isIncome = item\.type !== 'expense';/g, "const isIncome = item.type === 'income' || item.type === 'deposit';\n                                    const isTransfer = item.type === 'transfer';");

code = code.replace(/isIncome \? c\.incomeSoft : c\.border/g, "isIncome ? c.incomeSoft : (isTransfer ? c.backgroundElement : c.border)");
code = code.replace(/isIncome \? c\.income : c\.textSecondary/g, "isIncome ? c.income : (isTransfer ? c.textTertiary : c.textSecondary)");
code = code.replace(/isIncome \? c\.income : c\.text/g, "isIncome ? c.income : (isTransfer ? c.textSecondary : c.text)");
code = code.replace(/isIncome \? '\+' : '-'/g, "isTransfer ? '' : (isIncome ? '+' : '-')");

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Patched finance UI');
