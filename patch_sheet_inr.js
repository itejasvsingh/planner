const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/TransactionSheet.tsx', 'utf8');

// Change categories
const oldCat = `const EXPENSE_CATEGORIES = [
    { name: 'Food', icon: Coffee },
    { name: 'Shopping', icon: ShoppingBag },
    { name: 'Transport', icon: Car },
    { name: 'Bills', icon: Zap },
    { name: 'Entertainment', icon: Ticket },
    { name: 'Health', icon: Heart },
    { name: 'Other', icon: Wallet },
];`;
const newCat = `const EXPENSE_CATEGORIES = [
    { name: 'Food Delivery', icon: Coffee },
    { name: 'Cabs', icon: Car },
    { name: 'Festival Shopping', icon: ShoppingBag },
    { name: 'Mobile Recharge', icon: Zap },
    { name: 'Maid/Help', icon: Heart },
    { name: 'Other', icon: Wallet },
];`;
code = code.replace(oldCat, newCat);

// Add Transfer to income categories (we'll treat transfer as a separate tab soon, but for now just basic changes)
const oldInc = `const INCOME_CATEGORIES = [
    { name: 'Salary', icon: Briefcase },
    { name: 'Deposit', icon: Wallet },
    { name: 'Other', icon: Plus },
];`;
const newInc = `const INCOME_CATEGORIES = [
    { name: 'Salary', icon: Briefcase },
    { name: 'UPI Transfer', icon: Wallet },
    { name: 'Other', icon: Plus },
];`;
code = code.replace(oldInc, newInc);

// Change defaults
code = code.replace(/'Food'/g, "'Food Delivery'");
code = code.replace(/'\$'/g, "'₹'");

fs.writeFileSync('align-native/src/components/TransactionSheet.tsx', code);
console.log('Patched sheet formatting');
