const fs = require('fs');
let code = fs.readFileSync('align-native/src/lib/use-planner-items.ts', 'utf8');

if (!code.includes('const addItem = useCallback')) {
    code = code.replace(/const addExpense = useCallback\(/, `const addItem = useCallback(
    async (item: Omit<PlannerItem, 'id' | 'createdAt' | 'ownerId'>) => {
      return _saveNewItem(item);
    },
    [_saveNewItem]
  );
  
  const addExpense = useCallback(`);

    code = code.replace(/addExpense,\s*addGoal/, "addItem, addExpense, addGoal");
}

fs.writeFileSync('align-native/src/lib/use-planner-items.ts', code);
console.log('Patched use-planner-items.ts');
