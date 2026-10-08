const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');

code = code.replace(/styles\.taskCard, /g, "");
code = code.replace(/padding: 16 \}\]/g, "padding: 16, borderRadius: 20, borderWidth: 1 }]");

fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', code);
console.log('Fixed inline styles');
