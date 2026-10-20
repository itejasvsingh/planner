import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { ChevronDown, ChevronRight, MessageCircle } from 'lucide-react-native';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fmt, reminderText, type FriendBalance, type HistoryEntry } from '@/lib/splits';

const day = (key: string) => (key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

/**
 * Splitwise-style balances: who owes you and whom you owe, across all split expenses, optionally for one group.
 * Tap a friend to see the expenses behind it, record a payment (any amount, oldest first), remind them on WhatsApp,
 * or settle everything (tap twice to confirm).
 */
export default function FriendsCard({ balances, onSettle, onPay, groups = [], group = null, onGroup, history }: {
  balances: FriendBalance[];
  onSettle: (name: string) => void;
  /** Records a payment of `amount` with `name`. */
  onPay?: (name: string, amount: number) => void;
  groups?: { name: string; net: number }[];
  group?: string | null;
  onGroup?: (group: string | null) => void;
  /** Every split with a friend, open or settled. */
  history?: (name: string) => HistoryEntry[];
}) {
  const c = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [payText, setPayText] = useState('');
  const [showAll, setShowAll] = useState<string | null>(null);
  const owing = balances.filter(b => Math.round(b.net * 100) !== 0);
  const settledRows = balances.filter(b => Math.round(b.net * 100) === 0);
  if (!owing.length && !settledRows.length && !group) return null;
  const owedToYou = owing.filter(b => b.net > 0).reduce((s, b) => s + b.net, 0);
  const youOwe = owing.filter(b => b.net < 0).reduce((s, b) => s - b.net, 0);

  const list = (arr: FriendBalance[]) => (
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
        {arr.map((b, i) => {
          const expanded = open === b.name;
          const theyOwe = b.net > 0;
          const settled = Math.round(b.net * 100) === 0;
          const hist = history ? history(b.name) : [];
          const openHist = hist.filter(e => e.status !== 'settled');
          const doneHist = hist.filter(e => e.status === 'settled');
          const doneShown = showAll === b.name ? doneHist : doneHist.slice(0, 4);
          const entry = (e: HistoryEntry, j: number) => (
            <View key={`${e.id}-${j}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: e.status === 'settled' ? c.textTertiary : c.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{e.title}</Text>
                <Text style={{ color: c.textTertiary, fontSize: 12 }} numberOfLines={1}>{day(e.date)}{e.group ? ` · ${e.group}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: e.status === 'settled' ? c.textTertiary : e.amount > 0 ? c.income : c.expense, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {e.amount > 0 ? `+₹${fmt(e.amount)}` : `−₹${fmt(-e.amount)}`}
                </Text>
                <Text style={{ color: e.status === 'settled' ? c.income : c.textTertiary, fontSize: 11, fontWeight: '600' }}>
                  {e.status === 'settled' ? '✓ Settled' : e.status === 'part' ? `₹${fmt(e.paid)} of ₹${fmt(Math.abs(e.amount))} paid` : 'Open'}
                </Text>
              </View>
            </View>
          );
          return (
            <View key={b.name} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${b.name}: ${settled ? 'settled up' : theyOwe ? `owes you ₹${fmt(b.net)}` : `you owe ₹${fmt(-b.net)}`}`}
                onPress={() => { setOpen(expanded ? null : b.name); setConfirming(null); setPayText(''); }}
                style={styles.row}
              >
                <View style={[styles.avatar, { backgroundColor: c.backgroundMuted }]}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{b.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{b.name}</Text>
                  <Text style={{ color: settled ? c.textTertiary : theyOwe ? c.income : c.expense, fontSize: 13, fontWeight: '600' }}>
                    {settled ? 'settled up' : theyOwe ? `owes you ₹${fmt(b.net)}` : `you owe ₹${fmt(-b.net)}`}
                  </Text>
                </View>
                {expanded ? <ChevronDown color={c.textTertiary} size={18} /> : <ChevronRight color={c.textTertiary} size={18} />}
              </Pressable>
              {expanded && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                  {history ? (
                    <View style={{ gap: 10 }}>
                      {openHist.length > 0 && <Text style={[styles.sub, { color: c.textTertiary }]}>Open</Text>}
                      {openHist.map(entry)}
                      {doneHist.length > 0 && <Text style={[styles.sub, { color: c.textTertiary }, openHist.length > 0 && { marginTop: 6 }]}>Settled</Text>}
                      {doneShown.map(entry)}
                      {doneHist.length > 4 && (
                        <Pressable accessibilityRole="button" onPress={() => setShowAll(showAll === b.name ? null : b.name)} hitSlop={8} style={{ alignSelf: 'center' }}>
                          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{showAll === b.name ? 'Show fewer' : `Show all ${doneHist.length} settled`}</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : b.open.map((e, j) => (
                    <View key={`${e.id}-${j}`} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={{ flex: 1, color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>{e.title} · {day(e.date)}</Text>
                      <Text style={{ color: e.amount > 0 ? c.income : c.expense, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                        {e.amount > 0 ? `+₹${fmt(e.amount)}` : `−₹${fmt(-e.amount)}`}
                      </Text>
                    </View>
                  ))}
                  {onPay && !settled && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TextInput
                        accessibilityLabel={`Amount ${theyOwe ? `${b.name} paid you` : `you paid ${b.name}`}`}
                        value={payText}
                        onChangeText={setPayText}
                        keyboardType="decimal-pad"
                        placeholder={theyOwe ? 'Amount they paid you' : 'Amount you paid'}
                        placeholderTextColor={c.textTertiary}
                        style={{ flex: 1, backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md, fontSize: 15 }}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Record payment with ${b.name}`}
                        disabled={!(parseFloat(payText) > 0)}
                        onPress={() => { onPay(b.name, parseFloat(payText)); setPayText(''); setConfirming(null); }}
                        style={{ paddingHorizontal: 16, justifyContent: 'center', borderRadius: Radius.md, backgroundColor: parseFloat(payText) > 0 ? c.accentFill : c.backgroundMuted }}>
                        <Text style={{ color: parseFloat(payText) > 0 ? c.onAccent : c.textTertiary, fontWeight: '700' }}>Record</Text>
                      </Pressable>
                    </View>
                  )}
                  {theyOwe && !settled && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remind ${b.name} on WhatsApp`}
                      onPress={() => { const text = reminderText(b); if (text) void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`); }}
                      style={[styles.settle, { backgroundColor: c.backgroundMuted, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}>
                      <MessageCircle color={c.text} size={16} />
                      <Text style={{ color: c.text, fontWeight: '700' }}>Remind on WhatsApp</Text>
                    </Pressable>
                  )}
                  {!settled && <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={confirming === b.name ? `Confirm settle up with ${b.name}` : `Settle up with ${b.name}`}
                    onPress={() => {
                      if (confirming !== b.name) return setConfirming(b.name);
                      setConfirming(null);
                      setOpen(null);
                      onSettle(b.name);
                    }}
                    style={[styles.settle, { backgroundColor: confirming === b.name ? c.accentFill : c.accentSoft }]}
                  >
                    <Text style={{ color: confirming === b.name ? c.onAccent : c.accent, fontWeight: '700' }}>
                      {confirming === b.name
                        ? `Tap again: ${theyOwe ? `${b.name} paid you` : `you paid ${b.name}`} ₹${fmt(Math.abs(b.net))}`
                        : 'Settle up'}
                    </Text>
                  </Pressable>}
                </View>
              )}
            </View>
          );
        })}
      </View>
  );

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={[styles.header, { color: c.textTertiary }]}>Friends</Text>
      {groups.length > 0 && onGroup && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
          {[{ name: null as string | null, net: 0 }, ...groups].map(g => {
            const active = group === g.name;
            return (
              <Pressable key={g.name ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={g.name ? `Group ${g.name}` : 'All friends'}
                onPress={() => { onGroup(g.name); setOpen(null); }}
                style={[styles.chip, active ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                <Text style={{ color: active ? c.onAccent : c.text, fontWeight: '600', fontSize: 12 }}>{g.name ?? 'All'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={[styles.tile, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '600' }}>You are owed</Text>
          <Text style={{ color: owedToYou > 0 ? c.income : c.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>₹{fmt(owedToYou)}</Text>
        </View>
        <View style={[styles.tile, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '600' }}>You owe</Text>
          <Text style={{ color: youOwe > 0 ? c.expense : c.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>₹{fmt(youOwe)}</Text>
        </View>
      </View>
      {!owing.length && <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 8 }}>All settled up in {group}.</Text>}
      {owing.length > 0 && list(owing)}
      {settledRows.length > 0 && (
        <View style={{ marginTop: owing.length ? 18 : 0 }}>
          <Text style={[styles.header, { color: c.textTertiary, marginBottom: 8 }]}>Settled up</Text>
          {list(settledRows)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  card: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1 },
  tile: { flex: 1, borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  settle: { marginTop: 4, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
});
