import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MapPin, Store } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { spendByPlace, spendByShop, type Spot } from '@/lib/places';

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Analysis → "Where you spend": the cycle's spending by place (pins you added; name an unnamed spot once) or by shop
 * (every transaction, with or without a pin). Tap a row to see those transactions.
 */
export default function WhereYouSpend({ expenses, onSelectPlace, onSelectShop, onNameSpot }: {
  expenses: { id: string; title?: string; amount?: number | string | null; place?: unknown; placeName?: string | null }[];
  onSelectPlace: (name: string) => void;
  onSelectShop: (name: string) => void;
  onNameSpot: (spot: Spot, name: string) => void;
}) {
  const c = useTheme();
  const places = useMemo(() => spendByPlace(expenses), [expenses]);
  const shops = useMemo(() => spendByShop(expenses), [expenses]);
  const [tab, setTab] = useState<'places' | 'shops'>(places.length ? 'places' : 'shops');
  const [all, setAll] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [nameText, setNameText] = useState('');

  const rows: { key: string; name: string; total: number; count: number; spot?: Spot }[] = tab === 'places' ? places.map(p => ({ ...p, spot: p })) : shops;
  const shown = all ? rows : rows.slice(0, 6);
  const top = rows[0]?.total || 1;
  if (!places.length && !shops.length) return null;

  return (
    <View>
      <View style={styles.head}>
        <Text style={[styles.header, { color: c.textTertiary }]}>Where you spend</Text>
        <View style={[styles.seg, { backgroundColor: c.backgroundMuted }]}>
          {(['places', 'shops'] as const).map(t => (
            <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: tab === t }} onPress={() => { setTab(t); setAll(false); setNaming(null); }}
              style={[styles.segBtn, tab === t && { backgroundColor: c.backgroundElement }]}>
              <Text style={{ color: tab === t ? c.text : c.textSecondary, fontWeight: '700', fontSize: 12 }}>{t === 'places' ? 'Places' : 'Shops'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        {tab === 'places' && places.length === 0 && (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>No places yet. On a new expense, open More options → Place → Use my location.</Text>
        )}
        {shown.map((r, i) => {
          const Icon = tab === 'places' ? MapPin : Store;
          const unnamed = tab === 'places' && r.spot && !r.spot.named;
          return (
            <View key={r.key} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border, paddingVertical: 10, gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${r.name}, ${money(r.total)}, ${r.count} transactions`} onPress={() => !unnamed && (tab === 'places' ? onSelectPlace(r.name) : onSelectShop(r.name))} style={styles.row}>
                <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><Icon color={c.accent} size={16} /></View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: c.text, fontWeight: '600', fontSize: 15, flexShrink: 1 }} numberOfLines={1}>{r.name}</Text>
                    <Text style={{ color: c.text, fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] }}>{money(r.total)}</Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: c.backgroundMuted }]}>
                    <View style={{ width: `${Math.max(3, (r.total / top) * 100)}%`, height: '100%', backgroundColor: c.accent, borderRadius: Radius.pill }} />
                  </View>
                  <Text style={{ color: c.textTertiary, fontSize: 12 }}>{r.count} {r.count === 1 ? 'transaction' : 'transactions'}</Text>
                </View>
              </Pressable>
              {unnamed && (naming === r.key ? (
                <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 44 }}>
                  <TextInput accessibilityLabel="Name this spot" value={nameText} onChangeText={setNameText} maxLength={40} autoFocus placeholder="e.g. Office, Cafe on 5th" placeholderTextColor={c.textTertiary}
                    style={{ flex: 1, backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 12, paddingVertical: 9, borderRadius: Radius.md, fontSize: 15 }} />
                  <Pressable accessibilityRole="button" disabled={!nameText.trim()} onPress={() => { onNameSpot(r.spot as Spot, nameText.trim()); setNaming(null); setNameText(''); }}
                    style={{ paddingHorizontal: 14, justifyContent: 'center', borderRadius: Radius.md, backgroundColor: nameText.trim() ? c.accentFill : c.backgroundMuted }}>
                    <Text style={{ color: nameText.trim() ? c.onAccent : c.textTertiary, fontWeight: '700' }}>Save</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => { setNaming(r.key); setNameText(''); }} hitSlop={6} style={{ paddingLeft: 44 }}>
                  <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>Name this spot</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
        {rows.length > 6 && (
          <Pressable accessibilityRole="button" onPress={() => setAll(!all)} hitSlop={8} style={{ alignSelf: 'center', paddingTop: 6 }}>
            <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  seg: { flexDirection: 'row', padding: 2, borderRadius: Radius.sm, gap: 2 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.sm - 2 },
  card: { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  track: { height: 5, borderRadius: Radius.pill, overflow: 'hidden' },
});
