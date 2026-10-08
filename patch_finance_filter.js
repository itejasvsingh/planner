const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

// 1. Add state for selectedCategory
code = code.replace(/const \[editingItem, setEditingItem\] = useState<any>\(null\);/, 
    "const [selectedCategory, setSelectedCategory] = useState<string | null>(null);\n    const [editingItem, setEditingItem] = useState<any>(null);");

// 2. Filter groupedTransactions by selectedCategory
const groupLogic = `    // Group transactions by date
    const groupedTransactions = useMemo(() => {
        const groups: Record<string, any[]> = {};
        const sorted = [...financeItems].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        
        sorted.forEach(item => {
            if (selectedCategory && item.category !== selectedCategory) return;
            const date = item.date || 'Unknown';
            if (!groups[date]) groups[date] = [];
            groups[date].push(item);
        });
        
        return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
    }, [financeItems, selectedCategory]);`;
code = code.replace(/    \/\/ Group transactions by date[\s\S]*?\}, \[financeItems\]\);/, groupLogic);

// 3. Make category chips pressable in the chart
const chartItem = `<View key={cat.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>`;
const pressableChartItem = `<Pressable key={cat.name} onPress={() => setSelectedCategory(prev => prev === cat.name ? null : cat.name)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: selectedCategory && selectedCategory !== cat.name ? 0.4 : 1 }}>`;
code = code.replace(chartItem, pressableChartItem);
code = code.replace(/<\/View>\n                                <\/View>\n                            \}\)\)/g, 
                                                                "</View>\n                                </Pressable>\n                            }))");

// 4. Update the visual list header
code = code.replace(/<Text style=\{\[Type\.title, \{ color: c\.text, marginBottom: 16, marginTop: 8 \}\]\}>Recent Transactions<\/Text>/,
`<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 }}>
                    <Text style={[Type.title, { color: c.text }]}>{selectedCategory ? \`\${selectedCategory} Transactions\` : 'Recent Transactions'}</Text>
                    {selectedCategory && (
                        <Pressable onPress={() => setSelectedCategory(null)} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.backgroundElement, borderRadius: 12 }}>
                            <Text style={[Type.caption, { color: c.text }]}>Clear Filter</Text>
                        </Pressable>
                    )}
                </View>`);

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Patched finance filter');
