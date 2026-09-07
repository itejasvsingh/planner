import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export interface SplitPerson {
  name: string;
  settled: boolean;
  splitMode: 'equal' | 'percentage' | 'custom';
  percentage?: number | string;
  share: number | string;
}

interface SplitEditorProps {
  splits: SplitPerson[];
  setSplits: (splits: SplitPerson[]) => void;
  totalAmount: number | string;
  recentFriends?: string[];
}

export function calculateSplitAmounts(splits: SplitPerson[], totalAmount: number | string): SplitPerson[] {
  const total = Math.max(0, parseFloat(String(totalAmount)) || 0);
  const mode = splits[0]?.splitMode || 'equal';
  const participantCount = splits.length + 1;
  return splits.map(person => {
    const amount = mode === 'percentage'
      ? total * (Math.max(0, parseFloat(String(person.percentage)) || 0) / 100)
      : mode === 'custom'
        ? Math.max(0, parseFloat(String(person.share)) || 0)
        : total / participantCount;
    return { ...person, splitMode: mode, share: Math.round(amount * 100) / 100 };
  });
}

export default function SplitEditor({ splits = [], setSplits, totalAmount, recentFriends = [] }: SplitEditorProps) {
  const theme = useTheme();
  const [personName, setPersonName] = useState('');
  const [splitMode, setSplitMode] = useState<'equal' | 'percentage' | 'custom'>(splits[0]?.splitMode || 'equal');

  const calculatedSplits = calculateSplitAmounts(splits, totalAmount);
  const yourShare = Math.max(0, (parseFloat(String(totalAmount)) || 0) - calculatedSplits.reduce((sum, person) => sum + Number(person.share), 0));

  const setMode = (mode: 'equal' | 'percentage' | 'custom') => {
    setSplitMode(mode);
    setSplits(splits.map(person => ({ ...person, splitMode: mode })));
  };

  const addPeople = (names: string[]) => {
    const existing = new Set(splits.map(person => person.name));
    const additions = names
      .filter(name => !existing.has(name))
      .map(name => ({ name, settled: false, splitMode, percentage: 0, share: 0 }));
    if (additions.length) setSplits([...splits, ...additions]);
  };

  const addManualPerson = () => {
    if (!personName.trim()) return;
    addPeople([personName.trim()]);
    setPersonName('');
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: theme.text }]}>Who owes you?</Text>
      
      <View style={[styles.modeOptions, { backgroundColor: theme.background }]}>
        {(['equal', 'percentage', 'custom'] as const).map(mode => (
          <Pressable
            key={mode}
            style={[styles.modeOption, splitMode === mode && { backgroundColor: theme.blue }]}
            onPress={() => setMode(mode)}
          >
            <Text style={[styles.modeText, { color: splitMode === mode ? '#FFF' : theme.textSecondary }]}>
              {mode === 'custom' ? 'Custom' : mode === 'percentage' ? '%' : 'Equal'}
            </Text>
          </Pressable>
        ))}
      </View>

      {calculatedSplits.map((person, index) => (
        <View key={`${person.name}-${index}`} style={[styles.personRow, { borderBottomColor: theme.border }]}>
          <Text style={[styles.personName, { color: theme.text }]}>{person.name}</Text>
          
          {splitMode === 'percentage' && (
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              keyboardType="decimal-pad"
              placeholder="%"
              placeholderTextColor={theme.textSecondary}
              value={String(person.percentage || '')}
              onChangeText={val => setSplits(splits.map((entry, i) => i === index ? { ...entry, splitMode, percentage: val } : entry))}
            />
          )}
          
          {splitMode === 'custom' && (
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              keyboardType="decimal-pad"
              placeholder="₹"
              placeholderTextColor={theme.textSecondary}
              value={String(person.share || '')}
              onChangeText={val => setSplits(splits.map((entry, i) => i === index ? { ...entry, splitMode, share: val } : entry))}
            />
          )}
          
          <Text style={[styles.shareText, { color: theme.textSecondary }]}>
            ₹{Number(person.share).toFixed(2)}
          </Text>
          
          <Pressable style={styles.removeBtn} onPress={() => setSplits(splits.filter((_, i) => i !== index))}>
            <Text style={{ color: theme.red, fontSize: 24, fontWeight: '300' }}>×</Text>
          </Pressable>
        </View>
      ))}

      <Text style={[styles.yourShare, { color: theme.textSecondary }]}>
        Your share: <Text style={{ color: theme.text, fontWeight: '700' }}>₹{yourShare.toFixed(2)}</Text>
      </Text>

      <View style={styles.manualAdd}>
        <TextInput
          style={[styles.manualInput, { color: theme.text, borderColor: theme.border }]}
          placeholder="Enter friend's name..."
          placeholderTextColor={theme.textSecondary}
          value={personName}
          onChangeText={setPersonName}
          onSubmitEditing={addManualPerson}
          returnKeyType="done"
        />
        <Pressable style={[styles.addBtn, { backgroundColor: theme.blue }]} onPress={addManualPerson}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>Add</Text>
        </Pressable>
      </View>

      {recentFriends.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendsList}>
          {recentFriends.map(friend => (
            <Pressable key={friend} style={[styles.friendChip, { backgroundColor: theme.backgroundElement }]} onPress={() => addPeople([friend])}>
              <Text style={{ color: theme.text }}>+ {friend}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
  },
  modeOptions: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
  },
  modeOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeText: {
    fontWeight: '600',
    fontSize: 14,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  personName: {
    flex: 1,
    fontWeight: '600',
    fontSize: 16,
  },
  input: {
    width: 60,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    textAlign: 'center',
  },
  shareText: {
    fontWeight: '600',
    width: 80,
    textAlign: 'right',
  },
  removeBtn: {
    paddingHorizontal: 8,
  },
  yourShare: {
    fontSize: 15,
    marginVertical: 8,
  },
  manualAdd: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addBtn: {
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  friendsList: {
    gap: 8,
    paddingVertical: 8,
  },
  friendChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  }
});
