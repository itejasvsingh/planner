const fs = require('fs');

// Fix index.tsx
let idx = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');
idx = idx.replace(/triggerHaptic\('selection'\)/g, "triggerHaptic('light')");
fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', idx);

// Fix DrawerMenuModal.tsx
let drw = fs.readFileSync('align-native/src/components/DrawerMenuModal.tsx', 'utf8');
if (!drw.includes('import { doc, setDoc }')) {
    drw = drw.replace(/import \{ doc \} from 'firebase\/firestore';/, "import { doc, setDoc } from 'firebase/firestore';");
}
fs.writeFileSync('align-native/src/components/DrawerMenuModal.tsx', drw);

// Fix TaskCard.tsx
let tc = fs.readFileSync('align-native/src/components/TaskCard.tsx', 'utf8');
tc = tc.replace(/let iconColor = c\.textSecondary;/, 'let iconColor: string = c.textSecondary;');
tc = tc.replace(/let iconBg = c\.background;/, 'let iconBg: string = c.background;');
tc = tc.replace(/item\.time/g, "item.dueTime");
fs.writeFileSync('align-native/src/components/TaskCard.tsx', tc);

// Fix use-planner-items.ts
let upi = fs.readFileSync('align-native/src/lib/use-planner-items.ts', 'utf8');
upi = upi.replace(/window\.addEventListener/g, "typeof window.addEventListener === 'function'");
fs.writeFileSync('align-native/src/lib/use-planner-items.ts', upi);

console.log('Fixed TS errors');
