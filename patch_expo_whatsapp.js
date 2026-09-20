const fs = require('fs');
const file = 'align-native/src/app/settings/whatsapp.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add LayoutAnimation to react-native imports
if (!code.includes('LayoutAnimation')) {
    code = code.replace(
        "import { View, Text, StyleSheet, Switch, Pressable, ScrollView, Alert, Linking, Platform } from 'react-native';",
        "import { View, Text, StyleSheet, Switch, Pressable, ScrollView, Alert, Linking, Platform, LayoutAnimation, UIManager } from 'react-native';"
    );
}

// 2. Enable LayoutAnimation on Android
if (!code.includes('UIManager.setLayoutAnimationEnabledExperimental')) {
    code = code.replace(
        "export default function WhatsAppSettingsScreen() {",
        "if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {\n  UIManager.setLayoutAnimationEnabledExperimental(true);\n}\n\nexport default function WhatsAppSettingsScreen() {"
    );
}

// 3. Patch the toggle functions
// The toggles are currently done inline like: onClick={() => setIsTimePickerOpen(!isTimePickerOpen)} or similar.
// Let's replace the setIsTimePickerOpen and setIsReminderPickerOpen calls.

code = code.replace(
    /setIsTimePickerOpen\(!isTimePickerOpen\)/g,
    "{ LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsTimePickerOpen(!isTimePickerOpen); }"
);

code = code.replace(
    /setIsReminderPickerOpen\(!isReminderPickerOpen\)/g,
    "{ LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsReminderPickerOpen(!isReminderPickerOpen); }"
);

code = code.replace(
    /handleChangeReminderTiming\(opt\.id\);\s*setIsReminderPickerOpen\(false\);/g,
    "handleChangeReminderTiming(opt.id); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsReminderPickerOpen(false);"
);

// We should also patch auto-push toggle if there are any Layout shifts, but toggle is just a switch.

fs.writeFileSync(file, code);
