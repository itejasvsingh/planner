const fs = require('fs');
let code = fs.readFileSync('align-native/src/app/(tabs)/index.tsx', 'utf8');

// Replace the filter pills with SegmentedControl
code = code.replace(/<ScrollView horizontal showsHorizontalScrollIndicator=\{false\} contentContainerStyle=\{\{ paddingHorizontal: 16, gap: 8 \}\}>[\s\S]*?<\/ScrollView>/, 
`<View style={{ paddingHorizontal: 20 }}>
  <SegmentedControl tabs={['All', 'Open', 'Completed']} activeTab={filter} onTabChange={(f) => setFilter(f)} />
</View>`);

// Add SegmentedControl import
if (!code.includes('SegmentedControl')) {
    code = code.replace("import TaskCard from '@/components/TaskCard';", "import TaskCard from '@/components/TaskCard';\nimport SegmentedControl from '@/components/SegmentedControl';");
}

fs.writeFileSync('align-native/src/app/(tabs)/index.tsx', code);
console.log('Agenda updated');
