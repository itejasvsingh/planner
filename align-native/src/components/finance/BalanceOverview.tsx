import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Landmark } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { totalSeries } from '@/lib/account-balances';
import type { AccountBalance } from '@/lib/gmail-connect';
import BalanceTrend from './BalanceTrend';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Money → Overview: what's in your bank accounts as one big number with its trend over the last weeks, and a row per
 * account to tick in or out of that total. Tap the heading for the full Cards page.
 */
export default function BalanceOverview({ accounts, total, today, onToggle, onOpen }: {
  accounts: AccountBalance[];
  total: number;
  today: string;
  onToggle: (id: string, excluded: boolean) => void;
  onOpen: () => void;
}) {
  const c = useTheme();
  const series = useMemo(() => totalSeries(accounts, today), [accounts, today]);
  const counted = accounts.filter(a => !a.excluded).length;
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Bank accounts, ${counted} of ${accounts.length} counted. ${open ? 'Hide' : 'Show'} accounts`} onPress={() => setOpen(!open)} style={styles.head}>
        <Landmark color={c.textTertiary} size={14} />
        <Text style={[styles.label, { color: c.textTertiary }]}>In your bank accounts</Text>
        {accounts.length > 1 && <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '600' }}>{counted} of {accounts.length}</Text>}
        {open ? <ChevronUp color={c.textTertiary} size={16} /> : <ChevronDown color={c.textTertiary} size={16} />}
      </Pressable>
      <Text accessibilityLabel={`${inr(total)} in your bank accounts`} style={[styles.big, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>{inr(total)}</Text>
      {series.length >= 2 && (
        <View style={{ marginTop: 10 }}>
          <BalanceTrend history={series} height={84} hideNote />
        </View>
      )}
      {open && <View style={{ marginTop: 12, gap: 6 }}>
        {accounts.map(a => {
          const on = !a.excluded;
          return (
            <Pressable key={a.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              accessibilityLabel={`Count ${a.bankName} ${a.last4 || ''} in the total`}
              onPress={() => onToggle(a.id, on)}
              style={[styles.row, { backgroundColor: c.backgroundMuted }]}>
              <View style={[styles.check, on ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { borderColor: c.border }]}>
                {on && <Check color={c.onAccent} size={12} strokeWidth={3} />}
              </View>
              <Text style={{ color: on ? c.text : c.textTertiary, fontWeight: '600', fontSize: 14, flex: 1 }} numberOfLines={1}>{a.bankName}{a.last4 ? ` ••${a.last4}` : ''}</Text>
              <Text style={{ color: on ? c.text : c.textTertiary, fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] }}>{inr(a.balance)}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={onOpen} hitSlop={8} style={{ alignSelf: 'center', paddingTop: 6 }}>
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>All cards and accounts</Text>
        </Pressable>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.xl, padding: 16, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 },
  big: { fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 6, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
