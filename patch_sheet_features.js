const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/TransactionSheet.tsx', 'utf8');

// Add new state variables
const stateImports = `    const [date, setDate] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [isSplit, setIsSplit] = useState(false);
    const [splitWith, setSplitWith] = useState('');
    const [paidByYou, setPaidByYou] = useState(true);
    const [yourShareStr, setYourShareStr] = useState('');`;

code = code.replace(/const \[date, setDate\] = useState\(''\);/, stateImports);

// Update useEffect to reset/load new state
const oldEffect = `                setDate(new Date().toISOString().split('T')[0]);
            }`;
const newEffect = `                setDate(new Date().toISOString().split('T')[0]);
                setIsRecurring(false);
                setIsSplit(false);
                setSplitWith('');
                setPaidByYou(true);
                setYourShareStr('');
            }`;
code = code.replace(oldEffect, newEffect);

const oldItemEffect = `                setDate(item.date || new Date().toISOString().split('T')[0]);`;
const newItemEffect = `                setDate(item.date || new Date().toISOString().split('T')[0]);
                setIsRecurring(!!item.isRecurring);
                setIsSplit(!!item.split);
                if (item.split) {
                    setSplitWith(item.split.splitWith || '');
                    setPaidByYou(item.split.paidBy === 'you');
                    setYourShareStr(String(item.split.yourShare || 0));
                }`;
code = code.replace(oldItemEffect, newItemEffect);

// Update handleSave
const oldSave = `        await onSave({
            type,
            title,
            amount: parseFloat(amount) || 0,
            category,
            date
        });`;
const newSave = `        
        const finalAmount = parseFloat(amount) || 0;
        let splitData = null;
        if (isSplit && splitWith) {
            splitData = {
                totalAmount: finalAmount,
                splitWith,
                yourShare: parseFloat(yourShareStr) || (finalAmount / 2),
                paidBy: paidByYou ? 'you' : 'them',
                settled: false
            };
        }
        
        await onSave({
            type,
            title,
            amount: isSplit ? (parseFloat(yourShareStr) || (finalAmount / 2)) : finalAmount,
            category,
            date,
            isRecurring,
            ...(isRecurring ? { recurringFrequency: 'monthly' } : {}),
            ...(splitData ? { split: splitData } : {})
        });`;
code = code.replace(oldSave, newSave);

// Add UI toggles below Category Selector
const newUI = `
                        {/* Advanced Features */}
                        {type === 'expense' && (
                            <View style={{ backgroundColor: c.backgroundElement, borderRadius: Radius.lg, padding: 16, gap: 16 }}>
                                {/* Recurring Toggle */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>Monthly Bill</Text>
                                        <Text style={[Type.caption, { color: c.textTertiary }]}>Remind me and auto-log this</Text>
                                    </View>
                                    <Pressable 
                                        onPress={() => setIsRecurring(!isRecurring)}
                                        style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: isRecurring ? c.accent : c.border, padding: 2, justifyContent: 'center', alignItems: isRecurring ? 'flex-end' : 'flex-start' }}
                                    >
                                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF' }} />
                                    </Pressable>
                                </View>

                                {/* Split Toggle */}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>Split with Friends</Text>
                                        <Text style={[Type.caption, { color: c.textTertiary }]}>Track who owes what</Text>
                                    </View>
                                    <Pressable 
                                        onPress={() => setIsSplit(!isSplit)}
                                        style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: isSplit ? c.accent : c.border, padding: 2, justifyContent: 'center', alignItems: isSplit ? 'flex-end' : 'flex-start' }}
                                    >
                                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF' }} />
                                    </Pressable>
                                </View>

                                {/* Split Details */}
                                {isSplit && (
                                    <View style={{ marginTop: 8, gap: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 16 }}>
                                        <TextInput 
                                            value={splitWith}
                                            onChangeText={setSplitWith}
                                            placeholder="Friend's Name"
                                            placeholderTextColor={c.textTertiary}
                                            style={{ backgroundColor: theme.isDark ? '#000' : '#FFF', color: c.text, padding: 12, borderRadius: Radius.md }}
                                        />
                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            <Pressable 
                                                onPress={() => setPaidByYou(true)}
                                                style={{ flex: 1, padding: 12, borderRadius: Radius.md, backgroundColor: paidByYou ? c.accent : (theme.isDark ? '#000' : '#FFF'), alignItems: 'center' }}
                                            >
                                                <Text style={[Type.caption, { color: paidByYou ? '#FFF' : c.textSecondary, fontWeight: '600' }]}>You Paid</Text>
                                            </Pressable>
                                            <Pressable 
                                                onPress={() => setPaidByYou(false)}
                                                style={{ flex: 1, padding: 12, borderRadius: Radius.md, backgroundColor: !paidByYou ? c.accent : (theme.isDark ? '#000' : '#FFF'), alignItems: 'center' }}
                                            >
                                                <Text style={[Type.caption, { color: !paidByYou ? '#FFF' : c.textSecondary, fontWeight: '600' }]}>They Paid</Text>
                                            </Pressable>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <Text style={[Type.caption, { color: c.textSecondary, flex: 1 }]}>Your Share Amount:</Text>
                                            <TextInput 
                                                value={yourShareStr}
                                                onChangeText={setYourShareStr}
                                                placeholder={amount ? String(parseFloat(amount) / 2) : "0.00"}
                                                keyboardType="decimal-pad"
                                                placeholderTextColor={c.textTertiary}
                                                style={{ backgroundColor: theme.isDark ? '#000' : '#FFF', color: c.text, padding: 12, borderRadius: Radius.md, flex: 1 }}
                                            />
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                        
                        {/* Actions */}
`;

code = code.replace(/\{\/\* Actions \*\/\}/, newUI);

fs.writeFileSync('align-native/src/components/TransactionSheet.tsx', code);
console.log('Patched features into sheet');
