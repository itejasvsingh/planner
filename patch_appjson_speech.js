const fs = require('fs');
let data = JSON.parse(fs.readFileSync('align-native/app.json', 'utf8'));

if (data.expo.plugins) {
    data.expo.plugins = data.expo.plugins.filter(p => p !== "expo-speech-recognition" && (!Array.isArray(p) || p[0] !== "expo-speech-recognition"));
}

fs.writeFileSync('align-native/app.json', JSON.stringify(data, null, 2));
console.log('Removed speech plugin from app.json');
