import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import ScreenHeader from '@/components/ScreenHeader';
import HoldingSheet from '@/components/invest/HoldingSheet';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { useCards, refreshCards } from '@/lib/cards-store';
import { adjustBalances } from '@/lib/account-balances';
import { netWorth } from '@/lib/net-worth';
import { refreshHoldings, useHoldings } from '@/lib/holdings-store';
import { usePlannerItems } from '@/lib/use-planner-items';
import { collapseQuickAddOnScroll } from '@/lib/quick-add-state';
import { ME, TYPE_LABEL, summarize, wholeNetWorth, type Holding, type HoldingType, type Valued } from '@/lib/portfolio';

const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const units = (n: number) => String(Math.round(n * 1000) / 1000);
const TYPE_COLOR: Record<HoldingType, string> = { mf: '#4F6BED', stock: '#12A594', fd: '#E5A100', ppf: '#8A63D2', gold: '#D9822B', crypto: '#E05D8B', other: '#8F95B5' };

/**
 * Invest: the whole picture. Net worth on top (banks + investments, less card dues and loans, with your family's holdings
 * switched in or out), then every holding with its value and gain. Mutual funds are valued live from AMFI's public price
 * list; the rest you update by hand. Family holdings are ones you type in and label with their name.
 */
export default function InvestScreen() {
  const { phone } = usePhone();
  const theme = useTheme();
  const c = theme.isDark ? Colors.dark : Colors.light;
  const data = useHoldings(phone);
  const cardData = useCards(phone);
  const { items } = usePlannerItems(phone);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [withFamily, setWithFamily] = useState(true);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [sheet, setSheet] = useState(false);

  useFocusEffect(useCallback(() => { void refreshHoldings(phone); void refreshCards(phone); }, [phone]));

  const holdings = data?.holdings || [];
  const navs = data?.navs || {};
  const all = useMemo(() => summarize(holdings, navs), [holdings, navs]);
  const shown = useMemo(() => summarize(holdings, navs, filter), [holdings, navs, filter]);
  const family = useMemo(() => all.byOwner.map(o => o.owner).filter(o => o !== ME), [all]);
  const mine = all.byOwner.find(o => o.owner === ME)?.total || 0;
  const familyTotal = all.total - mine;

  const live = useMemo(() => (cardData ? adjustBalances(cardData.accounts || [], cardData.cards || [], items) : null), [cardData, items]);
  const nw = useMemo(() => netWorth(live?.accounts || [], live?.cards || [], cardData?.entries), [live, cardData]);
  const whole = wholeNetWorth({
    banks: nw.bank, owedOnCards: nw.owedOnCards, otherAssets: nw.customAssets.reduce((t, e) => t + e.value, 0),
    liabilities: nw.customLiabilities.reduce((t, e) => t + e.value, 0), mine, family: familyTotal,
  }, withFamily && family.length > 0);

  const open = (h: Holding | null) => { setEditing(h); setSheet(true); };
  const byType = useMemo(() => {
    const groups = new Map<HoldingType, Valued[]>();
    for (const h of shown.holdings) groups.set(h.type, [...(groups.get(h.type) || []), h]);
    return shown.byType.map(t => ({ ...t, items: groups.get(t.type) || [] }));
  }, [shown]);
  const gainColor = (n: number | null) => (n === null ? c.textTertiary : n >= 0 ? c.income : c.expense);

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{ paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
        onScroll={collapseQuickAddOnScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} onRefresh={() => { setRefreshing(true); void Promise.all([refreshHoldings(phone), refreshCards(phone)]).finally(() => setRefreshing(false)); }} />}
      >
        <ScreenHeader title="Invest" subtitle="Your portfolio and net worth" />
        <View style={{ paddingHorizontal: 16, width: '100%', maxWidth: 720, alignSelf: 'center', gap: 16 }}>
          {/* Whole net worth */}
          <View style={[styles.card, { backgroundColor: c.heroFill }, Shadow.card]}>
            <Text style={{ color: c.onHero, opacity: 0.75, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>Net worth</Text>
            <Text style={{ color: c.onHero, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 }}>{inr(whole.net)}</Text>
            <View style={{ marginTop: 12, gap: 6 }}>
              {whole.lines.map(l => (
                <View key={l.key} style={styles.line}>
                  <Text style={{ color: c.onHero, opacity: 0.8, fontSize: 14, flex: 1 }}>{l.sign < 0 ? '− ' : ''}{l.label}</Text>
                  <Text style={{ color: c.onHero, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{inr(l.value)}</Text>
                </View>
              ))}
            </View>
            {family.length > 0 && (
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: withFamily }} onPress={() => setWithFamily(!withFamily)} style={styles.toggle}>
                <View style={[styles.box, { borderColor: c.onHero, backgroundColor: withFamily ? c.onHero : 'transparent' }]} />
                <Text style={{ color: c.onHero, fontSize: 13, fontWeight: '600' }}>Include my family’s investments</Text>
              </Pressable>
            )}
          </View>

          {holdings.length === 0 ? (
            <View style={[styles.empty, { borderColor: c.border }]}>
              <TrendingUp color={c.textTertiary} size={30} />
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Add your first investment</Text>
              <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
                Mutual funds are valued live from their daily price. Stocks, FDs, gold, PPF and the rest you update by hand. Add your family’s too and label them with their name.
              </Text>
            </View>
          ) : (
            <>
              {/* Who */}
              {family.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {[{ owner: null as string | null, label: 'Everyone' }, { owner: ME as string | null, label: 'Me' }, ...family.map(f => ({ owner: f as string | null, label: f }))].map(o => {
                    const active = filter === o.owner;
                    return (
                      <Pressable key={o.label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setFilter(o.owner)}
                        style={[styles.chip, active ? { backgroundColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: 1 }]}>
                        <Text style={{ color: active ? c.onAccent : c.text, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {/* Value and gain */}
              <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: 1 }, Shadow.card]}>
                <Text style={[styles.label, { color: c.textTertiary }]}>{filter ? (filter === ME ? 'My investments' : `${filter}’s investments`) : 'All investments'}</Text>
                <Text style={{ color: c.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(shown.total)}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 6 }}>
                  <View><Text style={[styles.sub, { color: c.textTertiary }]}>Invested</Text><Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{shown.invested > 0 ? inr(shown.invested) : '—'}</Text></View>
                  <View>
                    <Text style={[styles.sub, { color: c.textTertiary }]}>Gain</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {shown.gainPct !== null && (shown.gain >= 0 ? <TrendingUp color={c.income} size={14} /> : <TrendingDown color={c.expense} size={14} />)}
                      <Text style={{ color: gainColor(shown.gainPct === null ? null : shown.gain), fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                        {shown.gainPct === null ? '—' : `${shown.gain >= 0 ? '+' : ''}${inr(shown.gain)} (${shown.gainPct >= 0 ? '+' : ''}${shown.gainPct}%)`}
                      </Text>
                    </View>
                  </View>
                </View>
                {shown.byType.length > 0 && (
                  <>
                    <View style={[styles.bar, { backgroundColor: c.backgroundMuted }]}>
                      {shown.byType.map(t => <View key={t.type} style={{ flex: Math.max(t.pct, 1), backgroundColor: TYPE_COLOR[t.type] }} />)}
                    </View>
                    <View style={styles.legend}>
                      {shown.byType.map(t => (
                        <View key={t.type} style={styles.legendItem}>
                          <View style={[styles.dot, { backgroundColor: TYPE_COLOR[t.type] }]} />
                          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{TYPE_LABEL[t.type]} {t.pct}%</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>

              {/* Holdings */}
              {byType.map(g => (
                <View key={g.type} style={{ gap: 8 }}>
                  <View style={styles.line}>
                    <Text style={[styles.label, { color: c.textTertiary, flex: 1 }]}>{TYPE_LABEL[g.type]}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(g.total)}</Text>
                  </View>
                  <View style={[styles.list, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
                    {g.items.map((h, i) => (
                      <Pressable key={h.id} accessibilityRole="button" accessibilityLabel={`${h.name}, ${inr(h.current)}. Change`} onPress={() => open(holdings.find(x => x.id === h.id) || null)}
                        style={[styles.row, { borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={2}>{h.name}</Text>
                          <Text style={{ color: c.textTertiary, fontSize: 12 }} numberOfLines={2}>
                            {[
                              h.owner !== ME ? h.owner : null,
                              h.source === 'nav' ? `${units(h.units || 0)} units · NAV ₹${navs[h.schemeCode || '']?.nav} (${h.navDate})` : h.source === 'price' ? `${units(h.units || 0)} × ₹${h.price}` : h.type === 'mf' && h.schemeCode ? 'Price not found yet' : null,
                              h.type === 'fd' && h.maturity ? `matures ${h.maturity}` : null,
                              h.rate ? `${h.rate}%` : null,
                            ].filter(Boolean).join(' · ') || ' '}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: c.text, fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] }}>{inr(h.current)}</Text>
                          {h.gainPct !== null && (
                            <Text style={{ color: gainColor(h.gain), fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{h.gain! >= 0 ? '+' : ''}{h.gainPct}%</Text>
                          )}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}

          <Pressable accessibilityRole="button" accessibilityLabel="Add a holding" onPress={() => open(null)} style={[styles.add, { borderColor: c.border }]}>
            <Plus color={c.accent} size={18} />
            <Text style={{ color: c.accent, fontWeight: '700' }}>Add a holding</Text>
          </Pressable>
          {holdings.length > 0 && <Text style={{ color: c.textTertiary, fontSize: 12, lineHeight: 17, textAlign: 'center' }}>Mutual fund prices come from AMFI’s public daily list. Update stocks, gold, FDs and the rest yourself by tapping them.</Text>}
        </View>
      </ScrollView>
      <HoldingSheet visible={sheet} holding={editing} phone={phone} family={family} defaultOwner={filter && filter !== ME ? filter : ME} onClose={() => setSheet(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: 16 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  sub: { fontSize: 11, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill },
  bar: { flexDirection: 'row', height: 8, borderRadius: Radius.pill, overflow: 'hidden', marginTop: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  list: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg, padding: 24, alignItems: 'center', gap: 8 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg, paddingVertical: 14 },
});
