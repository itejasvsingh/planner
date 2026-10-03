import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pencil } from 'lucide-react-native';
import { Pressable } from '@/components/ui/pressable';
import { CategoryManagerSheet } from '@/components/CategoryManager';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { categoriesFor, resolveCategory, tintColors, type CategoryKind } from '@/lib/categories';
import { useCategoryConfig } from '@/lib/use-category-config';

/**
 * Category chips for add/edit forms, ending in an "Edit" chip that opens the category manager.
 * A turned-off category still shows while it's the item's current one, so editing never loses it.
 */
export default function CategoryPicker({ kind, value, onChange }: { kind: CategoryKind; value: string; onChange: (name: string) => void }) {
  const c = useTheme();
  const { config } = useCategoryConfig();
  const [managing, setManaging] = useState(false);

  const list = categoriesFor(kind, config);
  const current = value ? resolveCategory(value, kind, config) : null;
  const shown = current && !list.some(cat => cat.id === current.id) ? [...list, current] : list;

  return (
    <View style={styles.wrap}>
      {shown.map(cat => {
        const selected = current?.id === cat.id;
        const Icon = cat.icon;
        return (
          <Pressable
            key={cat.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(cat.name)}
            style={[styles.chip, selected ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border }]}
          >
            <Icon size={15} color={selected ? c.onAccent : tintColors(cat.tint, c.isDark).fg} />
            <Text style={{ color: selected ? c.onAccent : c.text, fontWeight: '600', fontSize: 14 }}>{cat.name}</Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit categories"
        onPress={() => setManaging(true)}
        style={[styles.chip, { borderColor: c.border, borderStyle: 'dashed' }]}
      >
        <Pencil size={14} color={c.accent} />
        <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>Edit</Text>
      </Pressable>
      <CategoryManagerSheet visible={managing} onClose={() => setManaging(false)} kind={kind} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1 },
});
