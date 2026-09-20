const fs = require('fs');

// 1. Enable LayoutAnimation Globally in _layout.tsx
const layoutPath = 'align-native/src/app/_layout.tsx';
let layoutCode = fs.readFileSync(layoutPath, 'utf8');

if (!layoutCode.includes('UIManager.setLayoutAnimationEnabledExperimental')) {
    layoutCode = layoutCode.replace(
        "import { ActivityIndicator, View } from 'react-native';",
        "import { ActivityIndicator, View, Platform, UIManager } from 'react-native';\n\nif (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {\n  UIManager.setLayoutAnimationEnabledExperimental(true);\n}"
    );
    fs.writeFileSync(layoutPath, layoutCode);
}

// 2. Add LayoutAnimation to use-planner-items.ts
const plannerPath = 'align-native/src/lib/use-planner-items.ts';
let plannerCode = fs.readFileSync(plannerPath, 'utf8');

if (!plannerCode.includes('LayoutAnimation')) {
    plannerCode = plannerCode.replace(
        "import { triggerHaptic } from '@/lib/haptics';",
        "import { triggerHaptic } from '@/lib/haptics';\nimport { LayoutAnimation } from 'react-native';"
    );
    
    // Add to toggleDone
    plannerCode = plannerCode.replace(
        "const toggleDone = useCallback(\n    async (id: string, currentDone: boolean) => {",
        "const toggleDone = useCallback(\n    async (id: string, currentDone: boolean) => {\n      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);"
    );
    
    // Add to deleteItem
    plannerCode = plannerCode.replace(
        "const deleteItem = useCallback(\n    async (id: string) => {",
        "const deleteItem = useCallback(\n    async (id: string) => {\n      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);"
    );

    // Add to _saveNewItem
    plannerCode = plannerCode.replace(
        "const localItem: PlannerItem = {",
        "LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);\n      const localItem: PlannerItem = {"
    );

    fs.writeFileSync(plannerPath, plannerCode);
}
