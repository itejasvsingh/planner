import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, Users } from 'lucide-react-native';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fmt, type FriendBalance } from '@/lib/splits';

const day = (key: string) => (key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

/**
 * Splitwise-style balances: who owes you and whom you owe, across all split expenses.
 * Tap a friend to see the expenses behind it and settle up (tap twice to confirm).
 */
export default function FriendsCard({ balances, onSettle }: { balances: FriendBalance[]; onSettle: (name: string) => void }) {
  const c = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const owing = balances.filter(b => Math.round(b.net * 100) !== 0);
  if (!owing.length) return null;
  const owedToYou = owing.filter(b => b.net > 0).reduce((s, b) => s + b.net, 0);
  const youOwe = owing.filter(b => b.net < 0).reduce((s, b) => s - b.net, 0);

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={[styles.header, { color: c.textTertiary }]}>Friends</Text>
      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
        <View style={[styles.summary, { borderBottomColor: c.border }]}>
          <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><Users color={c.accent} size={18} /></View>
          <Text style={{ flex: 1, color: c.text, fontWeight: '600', fontSize: 14 }}>
            {[owedToYou > 0 ? `You're owed ₹${fmt(owedToYou)}` : '', youOwe > 0 ? `you owe ₹${fmt(youOwe)}` : ''].filter(Boolean).join(' · ').replace(/^you/, 'You')}
          </Text>
        </View>
        {owing.map((b, i) => {
          const expanded = open === b.name;
          const theyOwe = b.net > 0;
          return (
            <View key={b.name} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${b.name}: ${theyOwe ? `owes you ₹${fmt(b.net)}` : `you owe ₹${fmt(-b.net)}`}`}
                onPress={() => { setOpen(expanded ? null : b.name); setConfirming(null); }}
                style={styles.row}
              >
                <View style={[styles.avatar, { backgroundColor: c.backgroundMuted }]}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{b.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{b.name}</Text>
                  <Text style={{ color: theyOwe ? c.income : c.expense, fontSize: 13, fontWeight: '600' }}>
                    {theyOwe ? `owes you ₹${fmt(b.net)}` : `you owe ₹${fmt(-b.net)}`}
                  </Text>
                </View>
                {expanded ? <ChevronDown color={c.textTertiary} size={18} /> : <ChevronRight color={c.textTertiary} size={18} />}
              </Pressable>
              {expanded && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                  {b.open.map((e, j) => (
                    <View key={`${e.id}-${j}`} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={{ flex: 1, color: c.textSecondary, fontSize: 13 }} numberOfLines={1}>{e.title} · {day(e.date)}</Text>
                      <Text style={{ color: e.amount > 0 ? c.income : c.expense, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                        {e.amount > 0 ? `+₹${fmt(e.amount)}` : `−₹${fmt(-e.amount)}`}
                      </Text>
                    </View>
                  ))}
                  <Pressable
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
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  card: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1 },
  icon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  settle: { marginTop: 4, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
});
