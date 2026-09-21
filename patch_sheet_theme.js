const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/TransactionSheet.tsx', 'utf8');

code = code.replace(/theme\.isDark/g, "isDark");

fs.writeFileSync('align-native/src/components/TransactionSheet.tsx', code);
console.log('Fixed theme.isDark issue');
