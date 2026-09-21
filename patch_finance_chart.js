const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

const analyticsBlock = `
    const categoryTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        expenses.forEach(e => {
            const cat = e.category || 'Other';
            totals[cat] = (totals[cat] || 0) + (Number(e.amount) || 0);
        });
        return Object.entries(totals)
            .map(([name, amount]) => ({ name, amount, icon: getCategoryIcon(name) }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 4); // Top 4
    }, [expenses]);
`;

code = code.replace(/const totalEarned = incomes\.reduce[\s\S]*?;/, "$&\n" + analyticsBlock);

const uiBlock = `
                {/* Visual Analytics */}
                {categoryTotals.length > 0 && (
                    <View style={{ marginBottom: 24, paddingHorizontal: 4 }}>
                        <Text style={[Type.title, { color: c.text, marginBottom: 16 }]}>Spending Analytics</Text>
                        <View style={{ gap: 12 }}>
                            {categoryTotals.map(cat => (
                                <View key={cat.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.backgroundElement, alignItems: 'center', justifyContent: 'center' }}>
                                        <cat.icon color={c.textSecondary} size={16} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <Text style={[Type.caption, { color: c.text, fontWeight: '600' }]}>{cat.name}</Text>
                                            <Text style={[Type.caption, { color: c.textSecondary }]}>{formatMoney(cat.amount)}</Text>
                                        </View>
                                        <View style={{ width: '100%', height: 6, backgroundColor: c.backgroundElement, borderRadius: 3, overflow: 'hidden' }}>
                                            <View style={{ width: \`\${Math.min(100, (cat.amount / Math.max(totalSpent, 1)) * 100)}%\`, height: '100%', backgroundColor: c.expenseSoft, borderRadius: 3 }} />
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
`;

code = code.replace(/\{\/\* Transactions List \*\/\}/, uiBlock + "\n                {/* Transactions List */}");

// Need to fix JSX for Icon rendering again
code = code.replace(/<cat\.icon color=\{c\.textSecondary\} size=\{16\} \/>/g, "{(() => { const Icon = cat.icon; return <Icon color={c.textSecondary} size={16} />; })()}");

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Patched visual analytics');
