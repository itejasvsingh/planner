const fs = require('fs');
let drw = fs.readFileSync('align-native/src/components/DrawerMenuModal.tsx', 'utf8');
drw = drw.replace(/import \{ doc \} from 'firebase\/firestore';/, "");
drw = drw.replace(/import \{ doc, onSnapshot \} from 'firebase\/firestore';/, "import { doc, setDoc, onSnapshot } from 'firebase/firestore';");
drw = drw.replace(/import \{ doc, setDoc \} from 'firebase\/firestore';\n/, "");
fs.writeFileSync('align-native/src/components/DrawerMenuModal.tsx', drw);

let tc = fs.readFileSync('align-native/src/components/TaskCard.tsx', 'utf8');
tc = tc.replace(/let iconColor: string = c\.textSecondary;/g, 'let iconColor: any = c.textSecondary;');
// If it was already let iconColor = c.textSecondary;
tc = tc.replace(/let iconColor = c\.textSecondary;/g, 'let iconColor: any = c.textSecondary;');
fs.writeFileSync('align-native/src/components/TaskCard.tsx', tc);
