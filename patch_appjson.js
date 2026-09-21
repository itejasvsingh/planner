const fs = require('fs');
let data = JSON.parse(fs.readFileSync('align-native/app.json', 'utf8'));

if (data.expo.plugins) {
    data.expo.plugins = data.expo.plugins.filter(p => p !== "@react-native-google-signin/google-signin");
}

fs.writeFileSync('align-native/app.json', JSON.stringify(data, null, 2));
console.log('Removed plugin from app.json');
