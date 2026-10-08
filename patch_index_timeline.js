const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');

// 1. Imports
if (!code.includes('TransactionSheet')) {
    code = code.replace(/import ItemModal from '@\/components\/ItemModal';/, "import ItemModal from '@/components/ItemModal';\nimport TransactionSheet from '@/components/TransactionSheet';");
}

// 2. Add finance editing state & updateItem/deleteItem
code = code.replace(/const \[editingItem, setEditingItem\] = useState<PlannerItem \| null>\(null\);/, 
    "const [editingItem, setEditingItem] = useState<PlannerItem | null>(null);\n  const [editingFinanceItem, setEditingFinanceItem] = useState<any>(null);\n  const [isFinanceSheetVisible, setIsFinanceSheetVisible] = useState(false);");

code = code.replace(/const \{ items, saveItem \} = usePlannerItems\(phone\);/, 
    "const { items, saveItem, updateItem, deleteItem, addItem } = usePlannerItems(phone);");

// 3. Combine tasks and finances
code = code.replace(/const filtered = allDayTasks\.filter/, "const allDayItems = [...allDayTasks, ...dailyFinances];\n  const filtered = allDayItems.filter");

// 4. Update the "open" count
code = code.replace(/const open = allDayTasks\.length - completed;/, "const open = allDayTasks.length - completed; // keep open count for tasks only");

// 5. Update renderTask to renderItem
const renderItemLogic = `
  const openFinanceEditor = (item: any) => {
    setEditingFinanceItem(item);
    setIsFinanceSheetVisible(true);
  };

  const handleFinanceSave = async (updates: any) => {
    if (editingFinanceItem) {
        await updateItem(editingFinanceItem.id, updates);
    } else {
        await addItem(updates);
    }
  };

  function renderItem(item: any, isScheduled = false) {
    if (item.type === 'expense' || item.type === 'income' || item.type === 'transfer') {
      const isIncome = item.type === 'income' || item.type === 'deposit';
      const isTransfer = item.type === 'transfer';
      return (
        <Pressable 
          key={item.id} 
          onPress={() => openFinanceEditor(item)}
          style={[styles.taskCard, { backgroundColor: c.backgroundElement, borderColor: c.border, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1, opacity: isScheduled ? 1 : 0.9, marginBottom: 8 }]}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isIncome ? c.incomeSoft : (isTransfer ? c.backgroundElement : c.expenseSoft), alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            {isIncome ? <ArrowUpRight color={c.income} size={20} /> : <ArrowDownRight color={isTransfer ? c.textTertiary : c.expense} size={20} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>{item.title}</Text>
            <Text style={{ color: c.textTertiary, fontSize: 12, marginTop: 2 }}>{item.category || 'Other'}</Text>
          </View>
          <Text style={{ color: isIncome ? c.income : (isTransfer ? c.textSecondary : c.text), fontWeight: '700', fontSize: 16 }}>
            {isTransfer ? '' : (isIncome ? '+' : '-')}₹{item.amount || 0}
          </Text>
        </Pressable>
      );
    }
    return renderTask(item, isScheduled);
  }
`;
code = code.replace(/  function renderTask\(item: PlannerItem, isScheduled = false\) \{/, renderItemLogic + "\n  function renderTask(item: PlannerItem, isScheduled = false) {");

// 6. Use renderItem instead of renderTask in the JSX
code = code.replace(/\{renderTask\(item, true\)\}/g, "{renderItem(item, true)}");
code = code.replace(/\{anytime\.map\(item => renderTask\(item\)\)\}/g, "{anytime.map(item => renderItem(item))}");

// 7. Remove the old "Finances Section" block because they are now natively sorted!
const oldFinancesBlockStart = code.indexOf('{/* Finances Section */}');
if (oldFinancesBlockStart !== -1) {
    const nextTag = code.indexOf('</View>', oldFinancesBlockStart);
    // actually, it was a fragment: `</>\n              )}\n                {/* Finances Section */}`
    // Let's just use regex to remove it cleanly.
}
code = code.replace(/\{\/\* Finances Section \*\/\}[\s\S]*?\} \/\* End of Finances \*\/ \}\)/, "");
// simpler:
code = code.replace(/\{\/\* Finances Section \*\/\}[\s\S]*?<\/View>\n                      \);\n                    \}\)\}\n                  <\/>\n                \)\}/, "");

// 8. Mount TransactionSheet
code = code.replace(/<\/View>\n    <\/PhoneProvider>/, 
`      <TransactionSheet 
        visible={isFinanceSheetVisible} 
        item={editingFinanceItem} 
        onClose={() => setIsFinanceSheetVisible(false)} 
        onSave={handleFinanceSave}
        onDelete={deleteItem}
      />\n    </View>\n    </PhoneProvider>`);

fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', code);
console.log('Patched timeline integration');
