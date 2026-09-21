const fs = require('fs');
let mf = fs.readFileSync('public/manifest.json', 'utf8');
mf = mf.replace(/"background_color": "#0F172A"/g, '"background_color": "#0A0B0F"');
mf = mf.replace(/"theme_color": "#0F172A"/g, '"theme_color": "#0A0B0F"');
fs.writeFileSync('public/manifest.json', mf);
console.log('Patched public/manifest.json');
