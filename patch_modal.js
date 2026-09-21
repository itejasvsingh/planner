const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/EditTransactionSheet.tsx', 'utf8');

code = code.replace(/if \(!item\) return null;/g, "");

fs.writeFileSync('align-native/src/components/EditTransactionSheet.tsx', code);
console.log('Fixed modal conditional return');
