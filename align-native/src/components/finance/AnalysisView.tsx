import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ArrowDownRight, ArrowUpRight, Lightbulb, Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Pressable } from '@/components/ui/pressable';
import CycleStepper from './CycleStepper';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Shadow, Type } from '@/constants/theme';
import { kindForType, resolveCategory, tintColors, type CategoryConfig } from '@/lib/categories';
import {
  amountOf,
  buildInsights,
  byCategory,
  categoryChanges,
  cycleRange,
  cycleTrend,
  dailySeries,
  dateKey,
  elapsedDays,
  inRange,
  isMoney,
  pace,
  summarize,
  topExpenses,
  weekdayTotals,
  type Txn,
} from '@/lib/finance-analysis';

const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** Compact rupees for chart labels: ₹950, ₹1.2k, ₹1.4L. */
const compact = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1).replace(/\.0$/, '')}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `₹${Math.round(n)}`);

export type Bar = { key: string; label: string; value: number; detail: string; muted?: boolean };

/** Single-series bar chart: thin bars on a baseline, tap a bar for its exact value. */
export function BarChart({ bars, height = 120, avg, tickEvery = 1, wide }: { bars: Bar[]; height?: number; avg?: number; tickEvery?: number; wide?: boolean }) {
  const c = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map(b => b.value), avg || 0);
  const sel = selected !== null ? bars[selected] : null;
  return (
    <View>
      <Text style={[styles.chartReadout, { color: sel ? c.text : c.textSecondary }]} numberOfLines={1}>
        {sel ? sel.detail : avg !== undefined ? `Dashed line: ${money(Math.round(avg))}/day excluding bills · tap a bar` : 'Tap a bar for details'}
      </Text>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: wide ? 8 : 2 }}>
        {avg !== undefined && avg > 0 && (
          <View pointerEvents="none" style={[styles.avgLine, { bottom: (avg / max) * height, borderColor: c.textTertiary }]} />
        )}
        {bars.map((b, i) => {
          const h = b.value > 0 ? Math.max(3, (b.value / max) * height) : 0;
          const active = selected === i;
          return (
            <Pressable
              key={b.key}
              accessibilityRole="button"
              accessibilityLabel={b.detail}
              onPress={() => setSelected(active ? null : i)}
              // Hit area is the full column, larger than the bar itself.
              style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}
            >
              <View
                style={{
                  height: h,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  backgroundColor: b.muted ? c.backgroundMuted : c.accentFill,
                  opacity: selected === null || active ? 1 : 0.45,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.baseline, { backgroundColor: c.border }]} />
      <View style={{ flexDirection: 'row', gap: wide ? 8 : 2, marginTop: 6, height: 14 }}>
        {bars.map((b, i) => (
          // Labels may be wider than a thin column, so each is centered on its bar and allowed to overflow.
          <View key={b.key} style={{ flex: 1, alignItems: 'center' }}>
            {i % tickEvery === 0 && (
              <Text style={[styles.tick, { color: c.textTertiary }]}>{b.label}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  const c = useTheme();
  return (
    <>
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionHeader, { color: c.textTertiary }]}>{title}</Text>
        {right}
      </View>
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>{children}</View>
    </>
  );
}

/** Change against the previous period, with an arrow so it never relies on color alone. */
export function ChangeBadge({ pct, invert }: { pct: number | null; invert?: boolean }) {
  const c = useTheme();
  if (pct === null || !Number.isFinite(pct)) return <Text style={[styles.badgeText, { color: c.textTertiary }]}>New</Text>;
  const rounded = Math.round(pct * 100);
  if (Math.abs(rounded) < 1) return <View style={styles.badge}><Minus size={12} color={c.textTertiary} /><Text style={[styles.badgeText, { color: c.textTertiary }]}>0%</Text></View>;
  const up = rounded > 0;
  const bad = invert ? !up : up;
  const color = bad ? c.expense : c.income;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <View style={styles.badge}>
      <Icon size={12} color={color} strokeWidth={2.5} />
      <Text style={[styles.badgeText, { color }]}>{Math.abs(rounded)}%</Text>
    </View>
  );
}

export default function AnalysisView({
  items,
  payday,
  config,
  offset,
  onOffsetChange,
  onSelectCategory,
}: {
  items: Txn[];
  payday: number;
  config: CategoryConfig;
  /** Which salary cycle: 0 is the current one, -1 the one before. Shared with Overview. */
  offset: number;
  onOffsetChange: (offset: number) => void;
  onSelectCategory: (name: string) => void;
}) {
  const c = useTheme();

  const data = useMemo(() => {
    const moneyItems = items.filter(isMoney);
    const nameOf = (t: Txn) => resolveCategory(t.category, kindForType(t.type), config).name;
    const cycle = cycleRange(payday, offset);
    const prevCycle = cycleRange(payday, offset - 1);
    const inProgress = offset === 0;
    const elapsed = elapsedDays(cycle);
    const current = moneyItems.filter(t => inRange(t, cycle.startKey, cycle.endKey));
    // Compare an in-progress cycle with the same number of days at the start of the previous one.
    const prevEndKey = inProgress
      ? dateKey(new Date(prevCycle.start.getFullYear(), prevCycle.start.getMonth(), prevCycle.start.getDate() + elapsed))
      : prevCycle.endKey;
    const previousToDate = moneyItems.filter(t => inRange(t, prevCycle.startKey, prevEndKey < prevCycle.endKey ? prevEndKey : prevCycle.endKey));
    const summary = summarize(current);
    const prevSummary = summarize(previousToDate);
    const cats = byCategory(current, nameOf);
    const changes = new Map(categoryChanges(cats, byCategory(previousToDate, nameOf)).map(ch => [ch.name, ch]));
    const todayKey = dateKey(new Date());
    const daily = dailySeries(current, cycle).map(d => ({ ...d, future: d.key > todayKey }));
    const insights = buildInsights({ current, previousToDate, nameOf, cycle, inProgress, format: money });
    return {
      cycle, inProgress, elapsed, current, summary, prevSummary, cats, changes, daily, insights, nameOf,
      trend: cycleTrend(moneyItems, payday, 6, offset),
      pace: pace(current, cycle),
      weekdays: weekdayTotals(current),
      top: topExpenses(current, 5),
    };
  }, [items, payday, offset, config]);

  const { cycle, summary, prevSummary, cats, changes, daily, insights, trend, weekdays, top, inProgress, elapsed } = data;
  const spentPct = prevSummary.spent > 0 ? (summary.spent - prevSummary.spent) / prevSummary.spent : null;
  const avgPerDay = data.pace.perDay;
  const hasData = data.current.length > 0;

  return (
    <View style={{ gap: 4 }}>
      <CycleStepper payday={payday} offset={offset} onChange={onOffsetChange} />

      {/* Summary tiles */}
      <View style={styles.tiles}>
        <View style={[styles.tile, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
          <Text style={[styles.tileLabel, { color: c.textSecondary }]}>Spent</Text>
          <Text style={[styles.tileValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>{money(summary.spent)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ChangeBadge pct={spentPct} />
            <Text style={{ color: c.textTertiary, fontSize: 11 }}>{inProgress ? 'vs same days last cycle' : 'vs previous cycle'}</Text>
          </View>
        </View>
        <View style={[styles.tile, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
          <Text style={[styles.tileLabel, { color: c.textSecondary }]}>Income</Text>
          <Text style={[styles.tileValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>{money(summary.income)}</Text>
          <Text style={{ color: c.textTertiary, fontSize: 11 }}>{summary.expenseCount} expenses logged</Text>
        </View>
        <View style={[styles.tile, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
          <Text style={[styles.tileLabel, { color: c.textSecondary }]}>{summary.net >= 0 ? 'Saved' : 'Overspent'}</Text>
          <Text style={[styles.tileValue, { color: summary.net >= 0 ? c.text : c.expense }]} numberOfLines={1} adjustsFontSizeToFit>{money(Math.abs(summary.net))}</Text>
          <Text style={{ color: c.textTertiary, fontSize: 11 }}>{summary.savingsRate === null ? 'No income this cycle' : `${Math.round(summary.savingsRate * 100)}% of income kept`}</Text>
        </View>
        <View style={[styles.tile, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
          <Text style={[styles.tileLabel, { color: c.textSecondary }]}>Everyday spend</Text>
          <Text style={[styles.tileValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>{money(Math.round(avgPerDay))}</Text>
          <Text style={{ color: c.textTertiary, fontSize: 11 }}>
            {inProgress && elapsed >= 3 && elapsed < cycle.days
              ? `Per day · on pace for ${money(data.pace.projected)}`
              : data.pace.recurring > 0 ? `Per day · bills ${money(data.pace.recurring)} extra` : `Per day over ${elapsed} ${elapsed === 1 ? 'day' : 'days'}`}
          </Text>
        </View>
      </View>

      {!hasData ? (
        <View style={[styles.empty, { borderColor: c.border }]}>
          <Text style={[Type.body, { color: c.textSecondary, textAlign: 'center' }]}>No transactions in this cycle yet.</Text>
        </View>
      ) : (
        <>
          {insights.length > 0 && (
            <Section title="Insights">
              <View style={{ gap: 12 }}>
                {insights.map((ins, i) => {
                  const Icon = ins.tone === 'good' ? TrendingDown : ins.tone === 'bad' ? TrendingUp : Lightbulb;
                  const color = ins.tone === 'good' ? c.income : ins.tone === 'bad' ? c.expense : c.accent;
                  return (
                    <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <Icon size={16} color={color} style={{ marginTop: 2 }} />
                      <Text style={{ color: c.text, fontSize: 14, lineHeight: 20, flex: 1 }}>{ins.text}</Text>
                    </View>
                  );
                })}
              </View>
            </Section>
          )}

          <Section title="Daily spending">
            <BarChart
              avg={avgPerDay}
              tickEvery={7}
              bars={daily.map(d => ({
                key: d.key,
                label: String(d.date.getDate()),
                value: d.amount,
                muted: d.future,
                detail: `${d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${money(d.amount)}`,
              }))}
            />
          </Section>

          <Section title="By category" right={<Text style={{ color: c.textTertiary, fontSize: 12 }}>Tap to see transactions</Text>}>
            <View style={{ gap: 14 }}>
              {cats.map(cat => {
                const resolved = resolveCategory(cat.name, 'expense', config);
                const Icon = resolved.icon;
                const tint = tintColors(resolved.tint, c.isDark);
                const ch = changes.get(cat.name);
                return (
                  <Pressable key={cat.name} accessibilityRole="button" accessibilityLabel={`${cat.name}, ${money(cat.amount)}`} onPress={() => onSelectCategory(cat.name)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[styles.catIcon, { backgroundColor: tint.bg }]}>
                      <Icon color={tint.fg} size={16} />
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[Type.label, { color: c.text, fontWeight: '600', flex: 1 }]} numberOfLines={1}>{cat.name}</Text>
                        <Text style={[Type.label, { color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{money(cat.amount)}</Text>
                      </View>
                      <View style={[styles.track, { backgroundColor: c.backgroundMuted }]}>
                        <View style={{ width: `${Math.max(2, cat.share * 100)}%`, height: '100%', backgroundColor: tint.fg, borderRadius: Radius.pill }} />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: c.textTertiary, fontSize: 12, flex: 1 }}>
                          {Math.round(cat.share * 100)}% · {cat.count} {cat.count === 1 ? 'expense' : 'expenses'} · avg {money(Math.round(cat.amount / cat.count))}
                        </Text>
                        {ch && (ch.previous > 0 ? <ChangeBadge pct={ch.changePct} /> : <Text style={[styles.badgeText, { color: c.textTertiary }]}>New</Text>)}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Last 6 cycles">
            <BarChart
              wide
              height={110}
              bars={trend.map((t, i) => ({
                key: t.cycle.startKey,
                label: t.cycle.start.toLocaleDateString('en-US', { month: 'short' }),
                value: t.spent,
                muted: i === trend.length - 1 && inProgress,
                detail: `${short(t.cycle.start)} cycle · spent ${money(t.spent)} · income ${money(t.income)}`,
              }))}
            />
            <View style={[styles.table, { borderTopColor: c.border }]}>
              {trend.slice(-3).reverse().map(t => (
                <View key={t.cycle.startKey} style={styles.tableRow}>
                  <Text style={{ color: c.textSecondary, fontSize: 13, flex: 1 }}>{t.cycle.start.toLocaleDateString('en-US', { month: 'long' })}</Text>
                  <Text style={{ color: c.text, fontSize: 13, fontVariant: ['tabular-nums'], width: 90, textAlign: 'right' }}>{compact(t.spent)} spent</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'], width: 100, textAlign: 'right' }}>{compact(t.income)} in</Text>
                </View>
              ))}
            </View>
          </Section>

          <Section title="By weekday">
            <BarChart
              wide
              height={90}
              bars={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => ({
                key: d,
                label: d.slice(0, 1),
                value: weekdays[i],
                detail: `${d} · ${money(weekdays[i])} this cycle`,
              }))}
            />
          </Section>

          {top.length > 0 && (
            <Section title="Biggest expenses">
              <View>
                {top.map((t, i) => (
                  <View key={t.id} style={[styles.topRow, i < top.length - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={{ color: c.textTertiary, fontWeight: '700', width: 18 }}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>{t.title || 'Expense'}</Text>
                      <Text style={{ color: c.textTertiary, fontSize: 12, marginTop: 2 }}>
                        {data.nameOf(t)} · {t.date ? short(new Date(`${t.date}T12:00:00`)) : ''}
                      </Text>
                    </View>
                    <Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(amountOf(t))}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 4 },
  tileLabel: { fontSize: 12, fontWeight: '600' },
  tileValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18, marginBottom: 8 },
  sectionHeader: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: 16 },
  chartReadout: { fontSize: 13, fontWeight: '600', marginBottom: 10, fontVariant: ['tabular-nums'] },
  avgLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  baseline: { height: 1 },
  tick: { position: 'absolute', width: 40, textAlign: 'center', fontSize: 10, fontVariant: ['tabular-nums'] },
  catIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: Radius.pill, overflow: 'hidden' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  badgeText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  table: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 8, gap: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  empty: { padding: 28, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg, marginTop: 12 },
});
