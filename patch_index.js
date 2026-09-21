const fs = require('fs');
const file = 'align-native/src/app/(tabs)/index.tsx';
let code = fs.readFileSync(file, 'utf8');

// I will just replace the styling elements using the theme colors
code = code.replace(
  /const colors = useTheme\(\);/g,
  "const { isDark } = useTheme();\n  const c = isDark ? Colors.dark : Colors.light;"
);
code = code.replace(
  /colors\./g,
  "c."
);
// Make sure Colors is imported
if (!code.includes('Colors')) {
  code = code.replace(
    "import { useTheme } from '@/hooks/use-theme';",
    "import { useTheme } from '@/hooks/use-theme';\nimport { Colors, Radius, Shadow, Type } from '@/constants/theme';"
  );
}

// I won't rewrite the whole file, it's too big and risky for functionality. 
// I will just do a fast sed replacement for basic styles.
fs.writeFileSync(file, code);
