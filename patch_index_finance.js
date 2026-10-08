const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');

// 1. Add dailyFinances
code = code.replace(/const allDayTasks = items\.filter\(item => isTaskForDate\(item, dateKey\)\);/, 
    "const allDayTasks = items.filter(item => isTaskForDate(item, dateKey));\n  const dailyFinances = items.filter(item => (item.type === 'expense' || item.type === 'income') && item.date === dateKey);");

// 2. We need an icon mapping
const imports = `import { Wallet, Coffee, ShoppingBag, Car, Zap, Heart, Ticket, Briefcase, Plus, ArrowDownRight, ArrowUpRight } from 'lucide-react-native';`;
if (!code.includes('Wallet')) {
    code = code.replace(/import \{ [\s\S]*? \} from 'lucide-react-native';/, `${imports}`);
}

const financeRenderer = `
                {/* Finances Section */}
                {dailyFinances.length > 0 && (
                  <>
                    <View style={{ marginTop: 24, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Wallet color={c.textTertiary} size={16} />
                      <Text style={[styles.sectionHeader, { color: c.textTertiary, marginTop: 0 }]}>Finances</Text>
                    </View>
                    {dailyFinances.map(item => {
                      const isIncome = item.type === 'income';
                      return (
                        <View key={item.id} style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, flexDirection: 'row', alignItems: 'center', padding: 16 }]}>
                          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isIncome ? c.incomeSoft : c.expenseSoft, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                            {isIncome ? <ArrowUpRight color={c.income} size={20} /> : <ArrowDownRight color={c.expense} size={20} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>{item.title}</Text>
                            <Text style={{ color: c.textTertiary, fontSize: 12, marginTop: 2 }}>{item.category || 'Other'}</Text>
                          </View>
                          <Text style={{ color: isIncome ? c.income : c.text, fontWeight: '700', fontSize: 16 }}>
                            {isIncome ? '+' : '-'}₹{item.amount || 0}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}
`;

code = code.replace(/\{anytime\.map\(item => renderTask\(item\)\)\}\n                <\/>\n              \)\}/, 
    "{anytime.map(item => renderTask(item))}\n                </>\n              )}\n" + financeRenderer);

fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', code);
console.log('Patched index.tsx with finances');
