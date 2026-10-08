const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');

code = code.replace(/styles\.card/g, "styles.taskCard");

fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', code);
console.log('Fixed styles.card reference');
