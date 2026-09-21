const fs = require('fs');
let appJson = fs.readFileSync('align-native/app.json', 'utf8');
appJson = appJson.replace('"themeColor": "#0F172A"', '"themeColor": "#0A0B0F"');
appJson = appJson.replace('"backgroundColor": "#F4F5F7"', '"backgroundColor": "#0A0B0F"');
fs.writeFileSync('align-native/app.json', appJson);
console.log('Patched app.json');
