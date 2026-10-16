import { Modal, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseDateKey } from '@/lib/dates';
import { itemDateKey, type PlannerItem } from '@/lib/planner-item';
import { moveOptions } from '@/lib/reschedule';

/**
 * "Move to…" for a task (press and hold in Agenda or Calendar): Tomorrow, This weekend, Next week with their dates,
 * or "Pick another day…" to open the full editor.
 */
export default function MoveSheet({ item, today, onMove, onPick, onClose }: {
  item: PlannerItem | null;
  today: string;
  onMove: (item: PlannerItem, dateKey: string) => void;
  onPick: (item: PlannerItem) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  return (
    <Modal visible={item !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: c.background }]} onPress={() => {}}>
          {item && (
            <>
              <Text style={{ color: c.text, fontSize: 17, fontWeight: '800' }} numberOfLines={2}>Move “{item.title}”</Text>
              {moveOptions(today, itemDateKey(item)).map(o => (
                <Pressable key={o.key} accessibilityRole="button" onPress={() => onMove(item, o.key)} style={[styles.option, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{o.label}</Text>
                  <Text style={{ color: c.textTertiary, fontSize: 13 }}>{parseDateKey(o.key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" onPress={() => onPick(item)} style={[styles.option, { backgroundColor: c.accentSoft, borderColor: c.accentSoft }]}>
                <Text style={{ color: c.accent, fontWeight: '700', fontSize: 15 }}>Pick another day…</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 20, paddingBottom: 34, gap: 10 },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: Radius.md, borderWidth: 1 },
});
