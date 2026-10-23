import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, CalendarClock, CreditCard } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadow } from '@/constants/theme';
import type { Upcoming } from '@/lib/upcoming';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const shortDate = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const label = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/**
 * Every card due and the bills in the next two weeks, colour coded: red overdue, amber within 3 days, blue later.
 */
export default function UpcomingPayments({ rows }: { rows: Upcoming[] }) {
  const c = useTheme();
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 5);
  const tones = {
    overdue: { fg: c.expense, bg: c.expenseSoft },
    soon: { fg: c.warning, bg: c.warningSoft },
    later: { fg: c.accent, bg: c.accentSoft },
  } as const;
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[styles.header, { color: c.textTertiary }]}>Coming up</Text>
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
        {shown.map((r, i) => {
          const t = tones[r.tone];
          const Icon = r.tone === 'overdue' ? AlertTriangle : r.kind === 'card' ? CreditCard : CalendarClock;
          return (
            <View key={r.key} style={[styles.row, { borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
              <View style={[styles.icon, { backgroundColor: t.bg }]}><Icon color={t.fg} size={16} /></View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{r.title}</Text>
                <Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{r.tone === 'overdue' ? `Overdue · ${shortDate(r.date)}` : label(r.date)}</Text>
              </View>
              {r.amount > 0 && <Text style={{ color: r.tone === 'later' ? c.text : t.fg, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(r.amount)}</Text>}
            </View>
          );
        })}
      </View>
      {rows.length > 5 && (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} hitSlop={8} style={{ alignSelf: 'center', paddingTop: 8 }}>
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
