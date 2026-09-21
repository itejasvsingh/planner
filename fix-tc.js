const fs = require('fs');
let tc = fs.readFileSync('align-native/src/components/TaskCard.tsx', 'utf8');
tc = tc.replace(/let iconColor = c\.textTertiary;/g, 'let iconColor: string = c.textTertiary;');
tc = tc.replace(/let iconBg = c\.backgroundElement;/g, 'let iconBg: string = c.backgroundElement;');
fs.writeFileSync('align-native/src/components/TaskCard.tsx', tc);
