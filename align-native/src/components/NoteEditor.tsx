import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Pin, Trash2 } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { editedLabel } from '@/lib/notes';
import type { PlannerItem } from '@/lib/planner-item';

const SAVE_DELAY_MS = 600;
// A page of writing, not a form: no focus box around the text on the web
const noOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

/**
 * Full-screen note: a title and free text. Saves by itself a moment after you stop typing and when you
 * leave, so nothing is lost; a new note is only created once something is written, and a note emptied
 * completely is removed when you leave it.
 */
export default function NoteEditor({ visible, note, onClose }: { visible: boolean; note: PlannerItem | null; onClose: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { phone } = usePhone();
  const { addItem, updateItem, deleteItem } = usePlannerItems(phone);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [savedAt, setSavedAt] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Latest values for the delayed save, and the note's id once it exists
  const latest = useRef({ title: '', body: '', pinned: false });
  const id = useRef<string | null>(null);
  const creating = useRef<Promise<string> | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    const start = { title: note?.title || '', body: note?.body || '', pinned: !!note?.pinned };
    latest.current = start;
    setTitle(start.title);
    setBody(start.body);
    setPinned(start.pinned);
    setSavedAt(note?.updatedAt);
    setConfirmDelete(false);
    id.current = note?.id || null;
    creating.current = null;
    dirty.current = false;
  }, [visible, note]);

  async function save() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    const { title: t, body: b, pinned: p } = latest.current;
    const now = new Date().toISOString();
    if (!id.current && creating.current) id.current = await creating.current;
    if (!id.current) {
      if (!t.trim() && !b.trim()) return; // nothing written yet
      creating.current = addItem({ type: 'note', title: t.trim(), body: b, pinned: p, updatedAt: now }) as Promise<string>;
      id.current = await creating.current;
    } else {
      await updateItem(id.current, { title: t.trim(), body: b, pinned: p, updatedAt: now }, { quiet: true });
    }
    setSavedAt(now);
  }

  function change(patch: Partial<typeof latest.current>, now = false) {
    latest.current = { ...latest.current, ...patch };
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (now) void save();
    else timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  async function close() {
    await save();
    const { title: t, body: b } = latest.current;
    if (id.current && !t.trim() && !b.trim()) await deleteItem(id.current);
    onClose();
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    if (!id.current && creating.current) id.current = await creating.current;
    if (id.current) await deleteItem(id.current);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => void close()}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to notes" onPress={() => void close()} hitSlop={8} style={styles.back}>
            <ChevronLeft color={c.accent} size={24} />
            <Text style={{ color: c.accent, fontSize: 16, fontWeight: '600' }}>Notes</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pinned ? 'Unpin note' : 'Pin note'}
              accessibilityState={{ selected: pinned }}
              onPress={() => { setPinned(!pinned); change({ pinned: !pinned }, true); }}
              style={[styles.iconBtn, { backgroundColor: pinned ? c.accentSoft : c.backgroundMuted }]}
            >
              <Pin color={pinned ? c.accent : c.textSecondary} size={18} fill={pinned ? c.accent : 'transparent'} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmDelete ? 'Tap again to delete this note' : 'Delete note'}
              onPress={() => void remove()}
              style={[styles.iconBtn, confirmDelete ? { backgroundColor: c.expense, paddingHorizontal: 12, width: undefined } : { backgroundColor: c.backgroundMuted }]}
            >
              {confirmDelete ? <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Delete?</Text> : <Trash2 color={c.textSecondary} size={18} />}
            </Pressable>
          </View>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <TextInput
            accessibilityLabel="Note title"
            value={title}
            onChangeText={(t) => { setTitle(t); change({ title: t }); }}
            placeholder="Title"
            placeholderTextColor={c.textTertiary}
            style={[styles.title, noOutline, { color: c.text }]}
            returnKeyType="next"
          />
          <TextInput
            accessibilityLabel="Note"
            value={body}
            onChangeText={(t) => { setBody(t); change({ body: t }); }}
            placeholder="Write something you want to remember…"
            placeholderTextColor={c.textTertiary}
            multiline
            textAlignVertical="top"
            autoFocus={!note}
            style={[styles.body, noOutline, { color: c.text }]}
          />
          <Text style={{ color: c.textTertiary, fontSize: 12, textAlign: 'center', paddingVertical: 10, paddingBottom: 10 + insets.bottom }}>
            {savedAt ? `Saved · ${editedLabel(savedAt)}` : 'Saves as you type'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 8 },
  iconBtn: { height: 38, width: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, paddingVertical: 10 },
  body: { flex: 1, fontSize: 17, lineHeight: 25, paddingTop: 4 },
});
