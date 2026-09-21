const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

code = code.replace(/const formatMoney[\s\S]*?\};/, `const formatMoney = (amount: number) => {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
};`);

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
