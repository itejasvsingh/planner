import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dueRelative, walletSummary, type WalletAccount, type WalletCard } from '@/lib/upcoming';

const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const ago = (ms: number) => {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Wallet's first look: what you owe on cards (and what's due next, coloured by urgency) beside what's in your banks
 * (and how fresh that is). Both are the live figures: the last quoted balance with newer transactions applied.
 */
export default function WalletSummary({ cards, accounts }: { cards: WalletCard[]; accounts: WalletAccount[] }) {
  const c = useTheme();
  const s = walletSummary(cards, accounts);
  if (!cards.length && !accounts.length) return null;
  const tone = s.next ? ({ overdue: c.expense, soon: c.warning, later: c.textSecondary } as const)[s.next.tone] : c.textTertiary;
  const tile = [styles.tile, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card];

  return (
    <View style={styles.row}>
      <View style={tile} accessible accessibilityLabel={`To pay on cards ${inr(s.toPay)}`}>
        <Text style={[styles.label, { color: c.textTertiary }]}>To pay on cards</Text>
        <Text style={[styles.amount, { color: s.toPay > 0 ? (s.overdue ? c.expense : c.text) : c.income }]}>{inr(s.toPay)}</Text>
        <Text style={[styles.sub, { color: tone }]} numberOfLines={2}>
          {s.next
            ? `${s.overdue > 1 ? `${s.overdue} overdue · ` : ''}${s.next.title} · ${dueRelative(s.next.date)}`
            : s.toPay > 0 ? 'No due date yet' : 'Nothing due'}
        </Text>
      </View>
      <View style={tile} accessible accessibilityLabel={`In your banks ${inr(s.banks)}`}>
        <Text style={[styles.label, { color: c.textTertiary }]}>In your banks</Text>
        <Text style={[styles.amount, { color: c.text }]}>{inr(s.banks)}</Text>
        <Text style={[styles.sub, { color: c.textTertiary }]} numberOfLines={2}>
          {s.accounts ? `${s.accounts} account${s.accounts === 1 ? '' : 's'}${s.updatedAt ? ` · updated ${ago(s.updatedAt)}` : ''}` : 'No balances yet'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  tile: { flex: 1, borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 3, minHeight: 104 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  amount: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
  sub: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
});
