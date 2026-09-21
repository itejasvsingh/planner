const fs = require('fs');

// DrawerMenuModal
let drw = fs.readFileSync('align-native/src/components/DrawerMenuModal.tsx', 'utf8');
if (!drw.includes('import { doc, setDoc }')) {
    drw = `import { doc, setDoc } from 'firebase/firestore';\n` + drw;
}
fs.writeFileSync('align-native/src/components/DrawerMenuModal.tsx', drw);

// TaskCard
let tc = fs.readFileSync('align-native/src/components/TaskCard.tsx', 'utf8');
tc = tc.replace(/let iconColor: string = c\.textSecondary;/g, 'let iconColor: any = c.textSecondary;');
tc = tc.replace(/let iconBg: string = c\.background;/g, 'let iconBg: any = c.background;');
// If I missed the replacement earlier
tc = tc.replace(/let iconColor = c\.textSecondary;/g, 'let iconColor: any = c.textSecondary;');
tc = tc.replace(/let iconBg = c\.background;/g, 'let iconBg: any = c.background;');
fs.writeFileSync('align-native/src/components/TaskCard.tsx', tc);

// use-planner-items
let upi = fs.readFileSync('align-native/src/lib/use-planner-items.ts', 'utf8');
upi = upi.replace(/typeof window\.addEventListener === 'function'\('align_items_updated', handleUpdate\);/g, "if (typeof window.addEventListener === 'function') window.addEventListener('align_items_updated', handleUpdate);");
fs.writeFileSync('align-native/src/lib/use-planner-items.ts', upi);
