const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

const budgetBlock = `
                    <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', paddingTop: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={[Type.caption, { color: theme.isDark ? c.textTertiary : 'rgba(255,255,255,0.6)' }]}>Monthly Budget Limit</Text>
                            <Text style={[Type.caption, { color: theme.isDark ? c.textSecondary : 'rgba(255,255,255,0.8)' }]}>{formatMoney(totalSpent)} / {formatMoney(limits?.monthlyBudget || 50000)}</Text>
                        </View>
                        <View style={{ width: '100%', height: 6, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ width: \`\${Math.min(100, (totalSpent / (limits?.monthlyBudget || 50000)) * 100)}%\`, height: '100%', backgroundColor: totalSpent > (limits?.monthlyBudget || 50000) ? c.expense : (theme.isDark ? c.text : '#FFF'), borderRadius: 3 }} />
                        </View>
                    </View>
`;

code = code.replace(/<\/View>\n                <\/View>\n\n                \{\/\* Visual Analytics \*\/\}/, `${budgetBlock}\n                </View>\n                </View>\n\n                {/* Visual Analytics */}`);

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Added budget progress bar back');
