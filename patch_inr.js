const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

// Change currency
code = code.replace(/'en-US', \{ style: 'currency', currency: 'USD' \}/g, "'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }");

// Change categories
const oldIcons = `        case 'Food': return Coffee;
        case 'Shopping': return ShoppingBag;
        case 'Transport': return Car;
        case 'Bills': return Zap;
        case 'Entertainment': return Ticket;
        case 'Health': return Heart;
        case 'Salary': return Briefcase;
        default: return Wallet;`;
const newIcons = `        case 'Food Delivery': return Coffee;
        case 'Festival Shopping': return ShoppingBag;
        case 'Cabs': return Car;
        case 'Mobile Recharge': return Zap;
        case 'Maid/Help': return Heart;
        case 'Salary': return Briefcase;
        case 'UPI Transfer': return ArrowUpRight;
        default: return Wallet;`;
code = code.replace(oldIcons, newIcons);

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Patched finance formatting');
