const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

// Ensure useBudgetLimits is imported
if (!code.includes('useBudgetLimits')) {
    code = code.replace(/import \{ usePlannerItems \} from '@\/lib\/use-planner-items';/, "import { usePlannerItems, useBudgetLimits } from '@/lib/use-planner-items';");
}

code = code.replace(/const \{ budgetLimits: limits \} = usePlannerItems\(phone\);/, "const { budgetLimits: limits } = useBudgetLimits(phone);");

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Fixed useBudgetLimits import');
