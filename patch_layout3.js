const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/_layout.tsx', 'utf8');

code = code.replace(/height: 54 \+ insets\.bottom,/, "height: Platform.OS === 'web' ? 54 + 20 : 54 + insets.bottom,");
code = code.replace(/paddingBottom: insets\.bottom,/, "paddingBottom: Platform.OS === 'web' ? 20 : insets.bottom,");

fs.writeFileSync('align-native/src/app/(tabs)/_layout.tsx', code);
