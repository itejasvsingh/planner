import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronLeft, EyeOff, Plus, Trash2, X } from 'lucide-react-native';
import { Pressable } from '@/components/ui/pressable';
import SegmentedControl from '@/components/SegmentedControl';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Type } from '@/constants/theme';
import {
  CATEGORY_ICONS,
  allCategories,
  categoriesFor,
  kindForType,
  newCustomId,
  resolveCategory,
  tintColors,
  type Category,
  type CategoryConfig,
  type CategoryKind,
  withHidden,
} from '@/lib/categories';
import { useCategoryConfig } from '@/lib/use-category-config';
import { useBudgetLimits, usePlannerItems } from '@/lib/use-planner-items';
import { usePhone } from '@/lib/phone-context';
import { categoryBudgetKey } from '@/lib/budget';
import { triggerHaptic } from '@/lib/haptics';
import type { PlannerItem } from '@/lib/planner-item';

const KINDS: { label: string; kind: CategoryKind }[] = [
  { label: 'Expense', kind: 'expense' },
  { label: 'Income', kind: 'income' },
  { label: 'Transfer', kind: 'transfer' },
];

type Editing = { mode: 'new' } | { mode: 'edit'; category: Category } | { mode: 'remove'; category: Category };

/**
 * Add, rename, re-icon, hide and delete/merge categories. Renames and deletes also rewrite the affected
 * transactions and budget limits so nothing is left pointing at a name that no longer exists.
 */
export default function CategoryManager({
  visible,
  onClose,
  items,
  updateItem,
  budgets,
  saveBudgets,
  initialKind = 'expense',
}: {
  initialKind?: CategoryKind;
  visible: boolean;
  onClose: () => void;
  items: PlannerItem[];
  updateItem: (id: string, patch: Partial<PlannerItem>) => Promise<void>;
  budgets: Record<string, number>;
  saveBudgets: (updates: Record<string, number>) => Promise<void>;
}) {
  const c = useTheme();
  const { config, saveConfig } = useCategoryConfig();
  const [kind, setKind] = useState<CategoryKind>(initialKind);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState('');
  const [iconKey, setIconKey] = useState('tag');
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) setEditing(null);
    else setKind(initialKind);
  }, [visible, initialKind]);

  const list = allCategories(kind, config);

  // Items of this kind grouped by the category they resolve to.
  const itemsByCategory = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    for (const it of items) {
      if (it.type !== 'expense' && it.type !== 'income' && it.type !== 'deposit' && it.type !== 'transfer') continue;
      if (kindForType(it.type) !== kind) continue;
      const id = resolveCategory(it.category, kind, config).id;
      map.set(id, [...(map.get(id) || []), it]);
    }
    return map;
  }, [items, kind, config]);

  const open = (e: Editing) => {
    setError('');
    setTarget(null);
    if (e.mode === 'new') {
      setName('');
      setIconKey('tag');
    } else {
      setName(e.category.name);
      setIconKey(e.category.iconKey);
    }
    setEditing(e);
  };

  // Writes update the screen immediately and sync in the background: Firestore only resolves a write once the
  // server acknowledges it, so awaiting here would freeze the sheet while offline (writes are queued and sent later).
  const background = (p: Promise<unknown>) => { p.catch(e => console.warn('Category change not synced yet:', e)); };

  /** Points every transaction in `from` (and its budget limit) at `toName`. */
  const moveTransactions = (from: Category, toName: string) => {
    const affected = itemsByCategory.get(from.id) || [];
    for (const it of affected) background(updateItem(it.id, { category: toName, tags: [toName] }));
    if (kind === 'expense') {
      const oldLimit = Number(budgets[categoryBudgetKey(from.name)]) || 0;
      if (oldLimit > 0 && from.name !== toName) {
        const kept = Number(budgets[categoryBudgetKey(toName)]) || 0;
        background(saveBudgets({ [categoryBudgetKey(from.name)]: 0, [categoryBudgetKey(toName)]: Math.max(kept, oldLimit) }));
      }
    }
  };

  const saveEdit = async () => {
    if (!editing || editing.mode === 'remove') return;
    const trimmed = name.trim().replace(/^#/, '');
    if (!trimmed) return setError('Give the category a name.');
    const clash = list.find(cat => cat.name.toLowerCase() === trimmed.toLowerCase() && (editing.mode === 'new' || cat.id !== editing.category.id));
    if (clash) return setError(`“${clash.name}” already exists.`);

    setBusy(true);
    try {
      const next: CategoryConfig = { ...config, custom: [...(config.custom || [])], renamed: { ...(config.renamed || {}) }, icons: { ...(config.icons || {}) } };
      if (editing.mode === 'new') {
        next.custom!.push({ id: newCustomId(), name: trimmed, iconKey, kind });
      } else {
        const cat = editing.category;
        if (cat.builtin) {
          if (trimmed === cat.id) delete next.renamed![cat.id];
          else next.renamed![cat.id] = trimmed;
          next.icons![cat.id] = iconKey;
        } else {
          next.custom = next.custom!.map(cc => (cc.id === cat.id ? { ...cc, name: trimmed, iconKey } : cc));
        }
        if (trimmed !== cat.name) moveTransactions(cat, trimmed);
      }
      background(saveConfig(next));
      triggerHaptic('success');
      setEditing(null);
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggleHidden = (cat: Category) => {
    background(saveConfig(withHidden(config, cat.id, !cat.hidden)));
    triggerHaptic('light');
  };

  const confirmRemove = async () => {
    if (!editing || editing.mode !== 'remove') return;
    const cat = editing.category;
    const count = itemsByCategory.get(cat.id)?.length || 0;
    if (count > 0 && !target && !cat.builtin) return setError('Choose where its transactions should go.');
    setBusy(true);
    try {
      if (count > 0 && target) moveTransactions(cat, target);
      const next: CategoryConfig = cat.builtin
        ? withHidden(config, cat.id, true)
        : { ...config, custom: (config.custom || []).filter(cc => cc.id !== cat.id), hidden: (config.hidden || []).filter(h => h !== cat.id), shown: (config.shown || []).filter(h => h !== cat.id) };
      background(saveConfig(next));
      triggerHaptic('success');
      setEditing(null);
    } catch {
      setError('Could not update. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const renderRow = (cat: Category, i: number, rows: Category[]) => {
    const Icon = cat.icon;
    const count = itemsByCategory.get(cat.id)?.length || 0;
    return (
      <View key={cat.id} style={[styles.row, i < rows.length - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${cat.name}`} onPress={() => open({ mode: 'edit', category: cat })} style={styles.rowMain}>
          <View style={[styles.iconTile, { backgroundColor: tintColors(cat.tint, c.isDark).bg, opacity: cat.hidden ? 0.5 : 1 }]}>
            <Icon color={tintColors(cat.tint, c.isDark).fg} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowName, { color: cat.hidden ? c.textSecondary : c.text }]} numberOfLines={1}>{cat.name}</Text>
            {(count > 0 || !cat.builtin) && (
              <Text style={[styles.rowMeta, { color: c.textTertiary }]}>
                {count > 0 ? `${count} ${count === 1 ? 'transaction' : 'transactions'}` : ''}{count > 0 && !cat.builtin ? ' · ' : ''}{cat.builtin ? '' : 'Custom'}
              </Text>
            )}
          </View>
        </Pressable>
        {cat.id === 'Other' ? null : cat.hidden ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Turn on ${cat.name}`} hitSlop={8} onPress={() => toggleHidden(cat)} style={[styles.toggle, { backgroundColor: c.accentSoft }]}>
            <Plus color={c.accent} size={14} strokeWidth={2.5} />
            <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>Add</Text>
          </Pressable>
        ) : cat.builtin ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Turn off ${cat.name}`} hitSlop={8} onPress={() => toggleHidden(cat)} style={styles.rowAction}>
            <EyeOff color={c.textTertiary} size={18} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${cat.name}`} hitSlop={8} onPress={() => open({ mode: 'remove', category: cat })} style={styles.rowAction}>
            <Trash2 color={c.expense} size={18} />
          </Pressable>
        )}
      </View>
    );
  };

  const active = list.filter(cat => !cat.hidden);
  const off = list.filter(cat => cat.hidden);

  const renderList = () => (
    <>
      <SegmentedControl tabs={KINDS.map(k => k.label)} activeTab={KINDS.find(k => k.kind === kind)!.label} onTabChange={t => setKind(KINDS.find(k => k.label === t)!.kind)} />
      <Text style={[styles.hint, { color: c.textSecondary }]}>Tap a category to rename it or change its icon.</Text>
      <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        {active.map((cat, i) => renderRow(cat, i, active))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => open({ mode: 'new' })} style={[styles.addRow, { borderColor: c.border }]}>
        <Plus color={c.accent} size={18} strokeWidth={2.5} />
        <Text style={{ color: c.accent, fontWeight: '700', fontSize: 15 }}>New {kind} category</Text>
      </Pressable>
      {off.length > 0 && (
        <>
          <Text style={[styles.section, { color: c.textSecondary }]}>TURNED OFF</Text>
          <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            {off.map((cat, i) => renderRow(cat, i, off))}
          </View>
        </>
      )}
    </>
  );

  const renderEditor = () => {
    if (!editing) return null;
    if (editing.mode === 'remove') {
      const cat = editing.category;
      const count = itemsByCategory.get(cat.id)?.length || 0;
      const targets = categoriesFor(kind, config).filter(t => t.id !== cat.id);
      return (
        <>
          <Text style={[Type.body, { color: c.text }]}>
            {count > 0
              ? `“${cat.name}” has ${count} ${count === 1 ? 'transaction' : 'transactions'}. Move ${count === 1 ? 'it' : 'them'} to:${cat.builtin ? ' (optional; otherwise they stay where they are)' : ''}`
              : `${cat.builtin ? 'Turn off' : 'Delete'} “${cat.name}”? It has no transactions.`}
          </Text>
          {count > 0 && (
            <View style={styles.chips}>
              {targets.map(t => {
                const Icon = t.icon;
                const selected = target === t.name;
                return (
                  <Pressable key={t.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setTarget(t.name)}
                    style={[styles.chip, selected ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                    <Icon size={15} color={selected ? c.onAccent : tintColors(t.tint, c.isDark).fg} />
                    <Text style={{ color: selected ? c.onAccent : c.text, fontWeight: '600' }}>{t.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {!!error && <Text style={{ color: c.expense, fontSize: 13 }}>{error}</Text>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirmRemove()} style={[styles.primary, { backgroundColor: c.expense, opacity: busy ? 0.6 : 1 }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
              {cat.builtin
                ? (count > 0 && target ? `Move to ${target} and turn off` : 'Turn off category')
                : (count > 0 && target ? `Move to ${target} and delete` : 'Delete category')}
            </Text>
          </Pressable>
        </>
      );
    }

    const cat = editing.mode === 'edit' ? editing.category : null;
    const count = cat ? itemsByCategory.get(cat.id)?.length || 0 : 0;
    const renaming = !!cat && name.trim() !== cat.name;
    return (
      <>
        <Text style={[styles.label, { color: c.textSecondary }]}>Name</Text>
        <TextInput
          accessibilityLabel="Category name"
          value={name}
          onChangeText={t => { setName(t); setError(''); }}
          placeholder="e.g. Pets, Fuel, Kids"
          placeholderTextColor={c.textTertiary}
          maxLength={28}
          autoFocus={!cat}
          style={[styles.input, { color: c.text, backgroundColor: c.backgroundElement, borderColor: c.border }]}
        />
        {renaming && count > 0 && (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            {count} {count === 1 ? 'transaction' : 'transactions'} and any budget limit will move to the new name.
          </Text>
        )}
        <Text style={[styles.label, { color: c.textSecondary }]}>Icon</Text>
        <View style={styles.iconGrid}>
          {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => {
            const selected = key === iconKey;
            return (
              <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${key} icon`} accessibilityState={{ selected }} onPress={() => setIconKey(key)}
                style={[styles.iconChoice, { backgroundColor: selected ? c.accentFill : c.backgroundElement, borderColor: selected ? c.accentFill : c.border }]}>
                <Icon size={20} color={selected ? c.onAccent : c.textSecondary} />
              </Pressable>
            );
          })}
        </View>
        {!!error && <Text style={{ color: c.expense, fontSize: 13 }}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveEdit()} style={[styles.primary, { backgroundColor: c.accentFill, opacity: busy ? 0.6 : 1 }]}>
          <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 16 }}>{cat ? 'Save' : 'Add category'}</Text>
        </Pressable>
        {cat && cat.id !== 'Other' && (
          <Pressable accessibilityRole="button" onPress={() => open({ mode: 'remove', category: cat })} style={styles.secondary}>
            <Text style={{ color: c.expense, fontWeight: '600' }}>{cat.builtin ? 'Turn off or merge into another category' : 'Delete or merge into another category'}</Text>
          </Pressable>
        )}
      </>
    );
  };

  const title = !editing ? 'Categories' : editing.mode === 'new' ? `New ${kind} category` : editing.mode === 'remove' ? (editing.category.builtin ? `Turn off ${editing.category.name}` : `Delete ${editing.category.name}`) : `Edit ${editing.category.name}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => (editing ? setEditing(null) : onClose())}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: c.background }]}>
          <View style={styles.header}>
            {editing && (
              <Pressable accessibilityRole="button" accessibilityLabel="Back to categories" onPress={() => setEditing(null)} style={[styles.round, { backgroundColor: c.backgroundMuted }]}>
                <ChevronLeft color={c.textSecondary} size={18} />
              </Pressable>
            )}
            <Text style={[Type.title, { color: c.text, flex: 1 }]} numberOfLines={1}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close categories" onPress={onClose} style={[styles.round, { backgroundColor: c.backgroundMuted }]}>
              <X color={c.textSecondary} size={18} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {editing ? renderEditor() : renderList()}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 20, paddingBottom: 32, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  hint: { fontSize: 13 },
  group: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 12, minHeight: 58 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingVertical: 10 },
  iconTile: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12, marginTop: 2 },
  rowAction: { padding: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill, marginRight: 4 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginTop: 6 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed' },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: 14, fontSize: 16 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 46, height: 46, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1 },
  primary: { alignItems: 'center', paddingVertical: 15, borderRadius: Radius.md, marginTop: 4 },
  secondary: { alignItems: 'center', paddingVertical: 12 },
});

/** The manager with its own data, for opening from an add/edit sheet. Loads only while open. */
export function CategoryManagerSheet({ visible, onClose, kind }: { visible: boolean; onClose: () => void; kind: CategoryKind }) {
  return visible ? <ConnectedManager onClose={onClose} kind={kind} /> : null;
}

function ConnectedManager({ onClose, kind }: { onClose: () => void; kind: CategoryKind }) {
  const { phone } = usePhone();
  const { items, updateItem } = usePlannerItems(phone);
  const { budgetLimits, saveBudgets } = useBudgetLimits(phone);
  return (
    <CategoryManager
      visible
      onClose={onClose}
      initialKind={kind}
      items={items}
      updateItem={updateItem}
      budgets={budgetLimits as Record<string, number>}
      saveBudgets={saveBudgets}
    />
  );
}
