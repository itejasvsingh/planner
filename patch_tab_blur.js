const fs = require('fs');
const file = 'align-native/src/app/(tabs)/_layout.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('BlurView')) {
    code = code.replace(
        "import { ListTodo, Calendar, Wallet, Target } from 'lucide-react-native';",
        "import { ListTodo, Calendar, Wallet, Target } from 'lucide-react-native';\nimport { BlurView } from 'expo-blur';"
    );

    code = code.replace(
        "tabBarStyle: {",
        "tabBarBackground: () => (\n            <BlurView tint={colors.isDark ? 'dark' : 'light'} intensity={80} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />\n          ),\n          tabBarStyle: {"
    );

    code = code.replace(
        "backgroundColor: colors.backgroundElement,",
        "backgroundColor: 'transparent',"
    );

    fs.writeFileSync(file, code);
}
