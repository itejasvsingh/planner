const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

const filterLogic = `
    const { budgetLimits: limits } = usePlannerItems(phone);
    const payday = limits?.payday || 1;
    
    // Calculate current cycle dates
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let cycleStart = new Date(currentYear, currentMonth, payday);
    if (today.getDate() < payday) {
        cycleStart = new Date(currentYear, currentMonth - 1, payday);
    }
    
    let cycleEnd = new Date(cycleStart);
    cycleEnd.setMonth(cycleStart.getMonth() + 1);
    
    const cycleStartStr = cycleStart.toISOString().split('T')[0];
    const cycleEndStr = cycleEnd.toISOString().split('T')[0];

    // Filter only finance items for the CURRENT CYCLE
    const financeItems = items.filter(i => {
        if (i.type !== 'expense' && i.type !== 'income' && i.type !== 'deposit' && i.type !== 'transfer') return false;
        const d = i.date || '1970-01-01';
        return d >= cycleStartStr && d < cycleEndStr;
    });
`;

code = code.replace(/const financeItems = items\.filter[\s\S]*?\);/, filterLogic);
code = code.replace(/<Text style=\{\[Type\.displayLg, \{ color: c\.text, marginBottom: 24 \}\]\}>Tracker<\/Text>/, 
`<View style={{ marginBottom: 24 }}>
                    <Text style={[Type.displayLg, { color: c.text }]}>Tracker</Text>
                    <Text style={[Type.caption, { color: c.textTertiary, marginTop: 4 }]}>
                        Cycle: {cycleStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(cycleEnd.getTime() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                </View>`);

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Patched finance payday logic');
