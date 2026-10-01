import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Type } from '@/constants/theme';
import { categoriesFor } from '@/lib/categories';
import { useCategoryConfig } from '@/lib/use-category-config';
import { MONTHLY_BUDGET_KEY, categoryBudgetKey } from '@/lib/budget';
import { triggerHaptic } from '@/lib/haptics';

const PRESETS = [5000, 10000, 20000, 30000];

const toNumber = (s: string) => {
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Edit the monthly budget and optional per-category limits. Writes only the keys it owns. */
export default function BudgetSheet({
  visible,
  onClose,
  monthly,
  categories,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  monthly: number;
  categories: Record<string, number>;
  onSave: (updates: Record<string, number>) => Promise<void>;
}) {
  const c = useTheme();
  const { config: categoryConfig } = useCategoryConfig();
  const expenseCategories = categoriesFor('expense', categoryConfig);
  const [amount, setAmount] = useState('');
  const [catAmounts, setCatAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Load saved values when the sheet opens only, so a background sync can't overwrite what's being typed
  useEffect(() => {
    if (!visible) return;
    setAmount(monthly > 0 ? String(monthly) : '');
    setCatAmounts(Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, String(v)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = async () => {
    setSaving(true);
    try {
      const updates: Record<string, number> = { [MONTHLY_BUDGET_KEY]: toNumber(amount) };
      // Write every category key so cleared limits are stored as 0 (removed)
      for (const cat of expenseCategories) updates[categoryBudgetKey(cat.name)] = toNumber(catAmounts[cat.name] || '');
      await onSave(updates);
      triggerHaptic('success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const catTotal = Object.values(catAmounts).reduce((sum, v) => sum + toNumber(v), 0);
  const monthlyNum = toNumber(amount);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: c.background }]}>
          <View style={styles.headerRow}>
            <Text style={[Type.title, { color: c.text }]}>Budget</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close budget" onPress={onClose} style={[styles.close, { backgroundColor: c.backgroundMuted }]}>
              <X color={c.textSecondary} size={18} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={[Type.caption, { color: c.textSecondary }]}>Monthly budget</Text>
              <View style={styles.amountRow}>
                <Text style={[Type.displayLg, { color: c.text }]}>₹</Text>
                <TextInput
                  accessibilityLabel="Monthly budget"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="number-pad"
                  placeholder="10000"
                  placeholderTextColor={c.textTertiary}
                  style={[Type.displayLg, styles.amountInput, { color: c.text }]}
                />
              </View>
              <View style={styles.presets}>
                {PRESETS.map((p) => (
                  <Pressable
                    key={p}
                    accessibilityRole="button"
                    onPress={() => { triggerHaptic('light'); setAmount(String(p)); }}
                    style={[styles.preset, { backgroundColor: monthlyNum === p ? c.accentFill : c.backgroundMuted }]}
                  >
                    <Text style={{ color: monthlyNum === p ? c.onAccent : c.text, fontWeight: '700' }}>₹{p / 1000}k</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>Category limits (optional)</Text>
              <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                {expenseCategories.filter((cat) => cat.id !== 'Other').map((cat, i, arr) => {
                  const Icon = cat.icon;
                  return (
                    <View key={cat.name} style={[styles.catRow, i < arr.length - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                      <Icon color={c.textSecondary} size={18} />
                      <Text style={[styles.catName, { color: c.text }]} numberOfLines={1}>{cat.name}</Text>
                      <Text style={{ color: c.textTertiary }}>₹</Text>
                      <TextInput
                        accessibilityLabel={`${cat.name} limit`}
                        value={catAmounts[cat.name] || ''}
                        onChangeText={(v) => setCatAmounts((prev) => ({ ...prev, [cat.name]: v }))}
                        keyboardType="number-pad"
                        placeholder="—"
                        placeholderTextColor={c.textTertiary}
                        style={[styles.catInput, { color: c.text }]}
                      />
                    </View>
                  );
                })}
              </View>
              {monthlyNum > 0 && catTotal > monthlyNum && (
                <Text style={{ color: c.warning, fontSize: 13 }}>
                  Category limits add up to ₹{catTotal.toLocaleString('en-IN')}, more than the monthly budget.
                </Text>
              )}
            </View>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={save}
            style={[styles.saveBtn, { backgroundColor: c.accentFill, opacity: saving ? 0.6 : 1 }]}
          >
            <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 16 }}>{monthlyNum > 0 ? 'Save budget' : 'Remove budget'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 20, paddingBottom: 32, gap: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountInput: { minWidth: 80, width: 200, marginLeft: 4 },
  presets: { flexDirection: 'row', gap: 8, marginTop: 6 },
  preset: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill },
  sectionHeader: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4 },
  group: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 50 },
  catName: { flex: 1, fontSize: 15, fontWeight: '500' },
  catInput: { width: 90, textAlign: 'right', fontSize: 15, fontVariant: ['tabular-nums'], paddingVertical: 12 },
  saveBtn: { alignItems: 'center', paddingVertical: 15, borderRadius: Radius.md },
});
