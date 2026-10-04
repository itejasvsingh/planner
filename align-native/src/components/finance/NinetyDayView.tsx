import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Lightbulb, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { kindForType, resolveCategory, type CategoryConfig } from '@/lib/categories';
import { overview90, type Txn } from '@/lib/overview90';
import { todayKey } from '@/lib/dates';
import { BarChart, ChangeBadge } from './AnalysisView';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const compact = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1).replace(/\.0$/, '')}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `₹${Math.round(n)}`);
const day = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Money → Analysis → Last 90 days: where the money went, what's rising or falling, and who you pay most. */
export default function NinetyDayView({ items, config, onSelectCategory }: { items: Txn[]; config: CategoryConfig; onSelectCategory: (name: string) => void }) {
  const c = useTheme();
  const today = todayKey();
  const o = useMemo(
    () => overview90(items, today, (t) => resolveCategory(t.category, kindForType(t.type), config).name),
    [items, today, config],
  );
  const tile = (label: string, value: string, sub?: string) => (
    <View style={[styles.tile, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={{ color: c.textTertiary, fontSize: 11 }}>{sub}</Text> : null}
    </View>
  );

  if (o.spent === 0 && o.income === 0 && o.transfers === 0) {
    return <Text style={{ color: c.textSecondary, textAlign: 'center', marginTop: 24 }}>No transactions in the last 90 days yet.</Text>;
  }

  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: c.textSecondary, fontSize: 13 }}>{day(o.from)} – {day(o.to)}</Text>
      <View style={styles.tiles}>
        {tile('Spent', compact(o.spent), `${inr(o.perDay)}/day`)}
        {tile('Income', compact(o.income))}
        {tile('Transfers', compact(o.transfers), 'family & own a/cs')}
      </View>

      {o.notes.length > 0 && (
        <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
          {o.notes.map((n) => {
            const Icon = n.tone === 'bad' ? TrendingUp : n.tone === 'good' ? TrendingDown : Lightbulb;
            const color = n.tone === 'bad' ? c.expense : n.tone === 'good' ? c.income : c.accent;
            return (
              <View key={n.text} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
                <Icon color={color} size={16} style={{ marginTop: 2 }} />
                <Text style={{ color: c.text, flex: 1, fontSize: 14, lineHeight: 20 }}>{n.text}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={[styles.header, { color: c.textTertiary }]}>Month by month</Text>
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
        <BarChart
          wide
          height={110}
          bars={o.months.map((m, i) => ({
            key: m.from,
            label: i === 2 ? 'Last 30d' : i === 1 ? '31–60d' : '61–90d',
            value: m.spent,
            detail: `${day(m.from)} – ${day(m.to)}: spent ${inr(m.spent)} · income ${inr(m.income)}`,
          }))}
        />
      </View>

      <Text style={[styles.header, { color: c.textTertiary }]}>Week by week</Text>
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
        <BarChart
          height={90}
          tickEvery={3}
          bars={o.weeks.map((w) => ({ key: w.from, label: day(w.from), value: w.spent, detail: `Week of ${day(w.from)}: ${inr(w.spent)} (${compact(w.spent)})` }))}
        />
      </View>

      <Text style={[styles.header, { color: c.textTertiary }]}>Where it went · vs previous 30 days</Text>
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, paddingVertical: 4 }, Shadow.card]}>
        {o.categories.slice(0, 10).map((cat, i) => {
          const meta = resolveCategory(cat.name, 'expense', config);
          return (
            <Pressable key={cat.name} accessibilityRole="button" accessibilityLabel={`Show ${meta.name} transactions`} onPress={() => onSelectCategory(cat.name)}
              style={[styles.catRow, { borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>{meta.name}</Text>
                  <Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(cat.amount)}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: c.backgroundMuted }]}>
                  <View style={{ width: `${Math.round(cat.share * 100)}%`, height: '100%', backgroundColor: c.accentFill, borderRadius: Radius.pill }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: c.textTertiary, fontSize: 11 }}>{Math.round(cat.share * 100)}% · this month {inr(cat.last30)}</Text>
                  <ChangeBadge pct={cat.prev30 > 0 ? cat.changePct : cat.last30 > 0 ? null : 0} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {o.merchants.length > 0 && (
        <>
          <Text style={[styles.header, { color: c.textTertiary }]}>Who you pay most</Text>
          <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, paddingVertical: 4 }, Shadow.card]}>
            {o.merchants.map((m, i) => (
              <View key={m.title} style={[styles.merchant, { borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
                <Text style={{ color: c.text, flex: 1, fontWeight: '600' }} numberOfLines={1}>{m.title}</Text>
                <Text style={{ color: c.textTertiary, fontSize: 12 }}>{m.count}×</Text>
                <Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 80, textAlign: 'right' }}>{inr(m.amount)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderWidth: 1, borderRadius: Radius.lg, padding: 12, gap: 2 },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: 14 },
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: -4, marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  track: { height: 5, borderRadius: Radius.pill, overflow: 'hidden' },
  merchant: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
});
