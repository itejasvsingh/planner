const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/EditTransactionSheet.tsx', 'utf8');

code = code.replace(/const handleDelete = async \(\) => \{/, "const handleDelete = async () => {\n        if (!item || item.id === 'new') { onClose(); return; }\n");

fs.writeFileSync('align-native/src/components/EditTransactionSheet.tsx', code);
console.log('Fixed modal delete');
