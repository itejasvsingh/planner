const fs = require('fs');

// 1. Revert package.json
const pkgPath = 'package.json';
let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts.build = "next build --webpack";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

// 2. Revert prepare-expo-web.js
const prepPath = 'scripts/prepare-expo-web.js';
let prep = fs.readFileSync(prepPath, 'utf8');
prep = prep.replace(
  "if (hasAlignNodeModules || process.env.VERCEL) {",
  "if (!process.env.VERCEL && hasAlignNodeModules) {"
);
fs.writeFileSync(prepPath, prep);

// 3. Remove public/_expo from .gitignore
const ignorePath = '.gitignore';
let ignore = fs.readFileSync(ignorePath, 'utf8');
ignore = ignore.replace("public/_expo/", "");
fs.writeFileSync(ignorePath, ignore);

