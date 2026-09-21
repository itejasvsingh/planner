const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/finance.tsx', 'utf8');

// Add Plus icon import
if (!code.includes('Plus')) {
    code = code.replace(/TrendingUp \} from 'lucide-react-native';/, "TrendingUp, Plus } from 'lucide-react-native';");
}

// Add a floating action button before the closing ScrollView tag
code = code.replace(/<\/ScrollView>/, `
            <Pressable 
                onPress={() => setEditingItem({ id: 'new', type: 'expense', amount: 0, title: '', category: '', date: new Date().toISOString().split('T')[0] })}
                style={{
                    backgroundColor: c.accent,
                    width: 56, height: 56,
                    borderRadius: 28,
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'absolute',
                    bottom: 24, right: 24,
                    ...Shadow.raised
                }}>
                <Plus color="#FFF" size={24} />
            </Pressable>
        </ScrollView>`);

fs.writeFileSync('align-native/src/app/(tabs)/finance.tsx', code);
console.log('Added floating action button');
