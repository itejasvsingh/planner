const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/animated-icon.tsx', 'utf8');

code = code.replace(/import \{ scheduleOnRN \} from 'react-native-worklets';/, "");
code = code.replace(/import Animated, \{ Easing, Keyframe \} from 'react-native-reanimated';/, "import Animated, { Easing, Keyframe, runOnJS } from 'react-native-reanimated';");
code = code.replace(/scheduleOnRN\(setVisible, false\);/, "runOnJS(setVisible)(false);");

fs.writeFileSync('align-native/src/components/animated-icon.tsx', code);
console.log('Fixed worklets');
