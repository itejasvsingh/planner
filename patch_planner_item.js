const fs = require('fs');
let code = fs.readFileSync('align-native/src/lib/planner-item.ts', 'utf8');

code = code.replace(/item\.reminderTime \|\| item\.dueTime \|\| null/, "item.time || item.reminderTime || item.dueTime || null");

fs.writeFileSync('align-native/src/lib/planner-item.ts', code);
console.log('Patched itemTime');
