const fs = require('fs');
const pkgPath = 'package.json';
let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.scripts.build = "npm install --prefix align-native && node scripts/prepare-expo-web.js && next build --webpack";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

const prepPath = 'scripts/prepare-expo-web.js';
let prep = fs.readFileSync(prepPath, 'utf8');

prep = prep.replace(
  "if (!process.env.VERCEL && hasAlignNodeModules) {",
  "if (hasAlignNodeModules || process.env.VERCEL) {"
);

fs.writeFileSync(prepPath, prep);
