const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/QuickAddBar.tsx', 'utf8');

code = code.replace(/try\s*\{\s*const SpeechModule = require\('expo-speech-recognition'\);\s*ExpoSpeechRecognitionModule = SpeechModule\.ExpoSpeechRecognitionModule;\s*useSpeechRecognitionEvent = SpeechModule\.useSpeechRecognitionEvent;\s*\}\s*catch\s*\{\s*console\.warn\('Speech recognition native module not found - running in Expo Go mode\.'\);\s*\}/, "console.warn('Speech recognition explicitly disabled in this build to support Expo Go.');");

fs.writeFileSync('align-native/src/components/QuickAddBar.tsx', code);
console.log('Patched QuickAddBar.tsx');
