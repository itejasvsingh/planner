import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { NotebookPen, Pin, Plus, Search } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import ScreenHeader, { HeaderButton } from '@/components/ScreenHeader';
import NoteEditor from '@/components/NoteEditor';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadow } from '@/constants/theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import { editedLabel, isNote, noteHeading, notePreview, searchNotes, sortNotes } from '@/lib/notes';
import type { PlannerItem } from '@/lib/planner-item';

export default function NotesScreen() {
  const c = useTheme();
  const { phone } = usePhone();
  const { items, loading } = usePlannerItems(phone);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerItem | null>(null);

  const notes = useMemo(() => sortNotes(items.filter(isNote)), [items]);
  const shown = useMemo(() => searchNotes(notes, query), [notes, query]);
  const pinned = shown.filter(n => n.pinned);
  const others = shown.filter(n => !n.pinned);

  const openNote = (n: PlannerItem | null) => { setEditing(n); setOpen(true); };

  const card = (n: PlannerItem) => {
    const preview = notePreview(n);
    return (
      <Pressable
        key={n.id}
        accessibilityRole="button"
        accessibilityLabel={`Open note ${noteHeading(n)}`}
        onPress={() => openNote(n)}
        style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '700' }} numberOfLines={2}>{noteHeading(n)}</Text>
          {n.pinned ? <Pin color={c.accent} size={14} fill={c.accent} /> : null}
        </View>
        {preview ? <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 }} numberOfLines={4}>{preview}</Text> : null}
        <Text style={{ color: c.textTertiary, fontSize: 12, marginTop: 8 }}>{editedLabel(n.updatedAt)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false} onScroll={collapseQuickAddOnScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Notes"
          subtitle="Important things, written down."
          actions={
            <HeaderButton label="New note" onPress={() => openNote(null)} filled>
              <Plus size={20} color={c.onAccent} strokeWidth={2.5} />
            </HeaderButton>
          }
        />
        <View style={styles.content}>
          {notes.length > 0 && (
            <View style={[styles.search, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <Search color={c.textTertiary} size={17} />
              <TextInput
                accessibilityLabel="Search notes"
                value={query}
                onChangeText={setQuery}
                placeholder="Search notes"
                placeholderTextColor={c.textTertiary}
                style={{ flex: 1, color: c.text, fontSize: 15, paddingVertical: 11 }}
              />
            </View>
          )}

          {loading && !items.length ? (
            <ActivityIndicator color={c.accent} />
          ) : notes.length === 0 ? (
            <Pressable accessibilityRole="button" onPress={() => openNote(null)} style={[styles.empty, { borderColor: c.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: c.accentFill }]}>
                <NotebookPen size={22} color={c.onAccent} />
              </View>
              <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>Write down what matters</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
                Ideas, addresses, lists, things to remember. Tap here or + to start a note. Notes save as you type and work offline.
              </Text>
            </Pressable>
          ) : shown.length === 0 ? (
            <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 24 }}>No notes match “{query.trim()}”</Text>
          ) : (
            <>
              {pinned.length > 0 && <Text style={[styles.section, { color: c.textTertiary }]}>Pinned</Text>}
              <View style={{ gap: 10 }}>{pinned.map(card)}</View>
              {pinned.length > 0 && others.length > 0 && <Text style={[styles.section, { color: c.textTertiary }]}>Others</Text>}
              <View style={{ gap: 10 }}>{others.map(card)}</View>
            </>
          )}
        </View>
      </ScrollView>
      <NoteEditor visible={open} note={editing} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: 14 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
  empty: { padding: 32, alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg, marginTop: 8 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
