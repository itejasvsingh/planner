import { StyleSheet, View } from 'react-native';
import { CalendarClock, CreditCard } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadow } from '@/constants/theme';
import type { Upcoming } from '@/lib/upcoming';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const label = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/** Bills and card dues in the next two weeks, so nothing sneaks up on you. */
export default function UpcomingPayments({ rows }: { rows: Upcoming[] }) {
  const c = useTheme();
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[styles.header, { color: c.textTertiary }]}>Coming up</Text>
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
        {rows.slice(0, 3).map((r, i) => (
          <View key={r.key} style={[styles.row, { borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
            <View style={[styles.icon, { backgroundColor: c.backgroundMuted }]}>
              {r.kind === 'card' ? <CreditCard color={c.textSecondary} size={16} /> : <CalendarClock color={c.textSecondary} size={16} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{r.title}</Text>
              <Text style={{ color: c.textTertiary, fontSize: 12 }}>{label(r.date)}</Text>
            </View>
            {r.amount > 0 && <Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(r.amount)}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
