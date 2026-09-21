const fs = require('fs');
const file = 'align-native/src/app/(tabs)/index.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "const theme = useTheme();",
  "const theme = useTheme();\n  const c = theme.isDark ? Colors.dark : Colors.light;"
);
code = code.replace(/theme\.text/g, 'c.text');
code = code.replace(/theme\.background/g, 'c.background');
code = code.replace(/theme\.border/g, 'c.border');
code = code.replace(/theme\.blue/g, 'c.accent');
code = code.replace(/theme\.red/g, 'c.expense');

fs.writeFileSync(file, code);
