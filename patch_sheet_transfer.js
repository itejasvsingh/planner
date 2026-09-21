const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/TransactionSheet.tsx', 'utf8');

const newTrans = `const TRANSFER_CATEGORIES = [
    { name: 'Self Transfer', icon: Wallet },
    { name: 'Wallet Load', icon: Plus },
];`;
code = code.replace(/const INCOME_CATEGORIES = \[[\s\S]*?\];/, "$&\n\n" + newTrans);

const catLogic = `const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;`;
const newCatLogic = `const categories = type === 'expense' ? EXPENSE_CATEGORIES : (type === 'transfer' ? TRANSFER_CATEGORIES : INCOME_CATEGORIES);`;
code = code.replace(catLogic, newCatLogic);

code = code.replace(/tabs=\{\['Expense', 'Income'\]\}/, "tabs={['Expense', 'Income', 'Transfer']}");
code = code.replace(/activeTab=\{type === 'expense' \? 'Expense' : 'Income'\}/, "activeTab={type === 'expense' ? 'Expense' : (type === 'transfer' ? 'Transfer' : 'Income')}");
code = code.replace(/color: type === 'income' \? c\.income : c\.text/g, "color: type === 'income' ? c.income : (type === 'transfer' ? c.textSecondary : c.text)");

fs.writeFileSync('align-native/src/components/TransactionSheet.tsx', code);
console.log('Patched sheet transfer');
