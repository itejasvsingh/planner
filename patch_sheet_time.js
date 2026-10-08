const fs = require('fs');
let code = fs.readFileSync('align-native/src/components/TransactionSheet.tsx', 'utf8');

// 1. Add time state
const dateState = `    const [date, setDate] = useState('');`;
const timeState = `    const [date, setDate] = useState('');\n    const [time, setTime] = useState('');`;
code = code.replace(dateState, timeState);

// 2. Set default time
code = code.replace(/setDate\(new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]\);/g, 
    "setDate(new Date().toISOString().split('T')[0]);\n                setTime(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }));");

// 3. Load item.time
code = code.replace(/setDate\(item\.date \|\| new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]\);/, 
    "setDate(item.date || new Date().toISOString().split('T')[0]);\n                setTime(item.time || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }));");

// 4. Save item.time
code = code.replace(/date,(\s+)isRecurring,/, "date,\n            time,$1isRecurring,");

// 5. UI for Time Input next to Date Input
const uiRow = `                            <View style={{ flex: 1.5 }}>
                                <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Date</Text>
                                <TextInput 
                                    value={date}
                                    onChangeText={setDate}
                                    style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 16 }}
                                />
                            </View>`;
const newUiRow = `                            <View style={{ flex: 1.5, flexDirection: 'row', gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Date</Text>
                                    <TextInput 
                                        value={date}
                                        onChangeText={setDate}
                                        style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 16 }}
                                    />
                                </View>
                                <View style={{ flex: 0.8 }}>
                                    <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Time</Text>
                                    <TextInput 
                                        value={time}
                                        onChangeText={setTime}
                                        placeholder="10:00"
                                        placeholderTextColor={c.textTertiary}
                                        style={{ backgroundColor: c.backgroundElement, color: c.text, padding: 16, borderRadius: Radius.md, fontSize: 16 }}
                                    />
                                </View>
                            </View>`;
code = code.replace(uiRow, newUiRow);

fs.writeFileSync('align-native/src/components/TransactionSheet.tsx', code);
console.log('Patched time into sheet');
