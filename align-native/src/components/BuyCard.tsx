import { StyleSheet, View } from 'react-native';
import { ChevronRight, ShoppingBag } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dueBuys, openBuys, totalPrice, type BuyItem } from '@/lib/buy';
import { triggerHaptic } from '@/lib/haptics';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Agenda: what's on the Buy later list (items to remember today first), tick one off right here, tap the title for the whole list. */
export default function BuyCard({ items, today, onOpen, onBought }: { items: BuyItem[]; today: string; onOpen: () => void; onBought: (id: string) => void }) {
  const c = useTheme();
  const open = openBuys(items);
  if (!open.length) return null;
  const due = new Set(dueBuys(open, today).map(i => i.id));
  const shown = [...open].sort((a, b) => Number(due.has(b.id)) - Number(due.has(a.id))).slice(0, 4);
  const total = totalPrice(open);
  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open the Buy later list" onPress={onOpen} style={styles.head}>
        <ShoppingBag color={c.textTertiary} size={15} />
        <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 }}>
          Buy later · {open.length}{total ? ` · about ${inr(total)}` : ''}
        </Text>
        <ChevronRight color={c.textTertiary} size={16} />
      </Pressable>
      {shown.map(b => (
        <View key={b.id} style={styles.row}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`Mark ${b.title} bought`} hitSlop={10}
            onPress={() => { triggerHaptic('success'); onBought(b.id); }} style={[styles.check, { borderColor: c.border }]} />
          <Pressable accessibilityRole="button" onPress={onOpen} style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{b.title}</Text>
          </Pressable>
          {due.has(b.id) ? <Text style={{ color: c.warning, fontSize: 12, fontWeight: '700' }}>today</Text> : b.price ? <Text style={{ color: c.textTertiary, fontSize: 13 }}>{inr(b.price)}</Text> : null}
        </View>
      ))}
      {open.length > shown.length && (
        <Pressable accessibilityRole="button" onPress={onOpen} style={{ paddingTop: 6 }}>
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>+ {open.length - shown.length} more</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, marginTop: 16, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
});
