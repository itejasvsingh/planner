const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');

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

  function renderItem(item: any, hideTime = false) {
    if (item.type === 'expense' || item.type === 'income' || item.type === 'transfer') {
      const isIncome = item.type === 'income' || item.type === 'deposit';
      const isTransfer = item.type === 'transfer';
      return (
        <Pressable 
          key={item.id} 
          onPress={() => openFinanceEditor(item)}
          style={{ backgroundColor: c.backgroundElement, borderColor: c.border, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1, opacity: hideTime ? 1 : 0.9, marginBottom: 8 }}
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
    return renderTask(item, hideTime);
  }
`;

code = code.replace(/  function renderTask\(item: PlannerItem, hideTime = false\) \{/, renderItemLogic + "\n  function renderTask(item: PlannerItem, hideTime = false) {");

fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', code);
console.log('Fixed renderItem');
