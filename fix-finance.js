const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

code = code.replace(/\(\(\) => \{ const Icon = cat\.icon; return <Icon color=\{c\.accent\} size=\{20\} \/>; \}\)\(\)/g, '{(() => { const Icon = cat.icon; return <Icon color={c.accent} size={20} />; })()}');

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Fixed finance.tsx curly braces');
