import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CreditCard, Landmark } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { whenSignedIn } from '@/lib/firebase';
import { getItem, setItem } from '@/lib/storage';
import { moneyAccounts, type AccountBalance, type CardSummary } from '@/lib/gmail-connect';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;
const day = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

type Data = { cards: CardSummary[]; accounts: AccountBalance[] };

/**
 * Credit cards (due date, statement, outstanding now) and bank balances found in bank emails and SMS.
 * Shows the last known numbers at once (saved on the device) and refreshes whenever Money is opened.
 */
export default function CardsAccounts({ phone, showEmpty, onOpenSettings }: { phone: string | null; showEmpty?: boolean; onOpenSettings?: () => void }) {
  const c = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const key = `align_money_accounts_${phone || 'guest'}`;

  useEffect(() => {
    void getItem(key).then(raw => {
      if (!raw) return;
      try { setData(d => d || JSON.parse(raw)); } catch { /* ignore */ }
    });
  }, [key]);

  useFocusEffect(useCallback(() => {
    if (!phone) return;
    let live = true;
    // The app can open before Firebase has restored the sign-in; ask once it has
    const stop = whenSignedIn(() => {
      moneyAccounts()
        .then(d => { if (!live) return; setData(d); void setItem(key, JSON.stringify(d)); })
        .catch(() => { /* offline: keep the saved numbers */ });
    });
    return () => { live = false; stop(); };
  }, [phone, key]));

  const empty = !data || (!data.cards.length && !data.accounts.length);
  if (empty && !showEmpty) return null;
  const settingsLink = onOpenSettings ? (
    <Pressable accessibilityRole="button" onPress={onOpenSettings} hitSlop={6} style={{ alignSelf: 'center', paddingVertical: 10 }}>
      <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>Gmail, banks & statement passwords</Text>
    </Pressable>
  ) : null;
  if (empty) {
    return (
      <View style={[styles.empty, { borderColor: c.border }]}>
        <CreditCard color={c.textTertiary} size={32} />
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Your cards and bank balances</Text>
        <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
          Connect Gmail and Align finds your credit card statements (due date, amount due, what you owe now) and your
          bank balances from alerts. Add statement passwords to read bank statement PDFs too.
        </Text>
        {settingsLink}
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.header, { color: c.textTertiary }]}>Credit cards & bills</Text>
      <View style={{ gap: 10 }}>
        {data.cards.map(card => {
          const tone = card.status === 'overdue' ? c.expense : card.status === 'paid' ? c.income : card.daysLeft <= 3 ? c.expense : c.textSecondary;
          const dueText = card.status === 'paid'
            ? `Paid · was due ${day(card.dueDate)}`
            : card.status === 'overdue'
              ? `Overdue by ${-card.daysLeft} day${card.daysLeft === -1 ? '' : 's'} · was due ${day(card.dueDate)}`
              : card.daysLeft === 0 ? `Due today · ${day(card.dueDate)}` : `Due ${day(card.dueDate)} · in ${card.daysLeft} day${card.daysLeft === 1 ? '' : 's'}`;
          const details = [
            `Statement ${inr(card.totalDue)}`,
            card.minDue ? `min ${inr(card.minDue)}` : '',
            card.paidSince ? `paid ${inr(card.paidSince)}` : '',
            card.spentSince ? `spent since ${inr(card.spentSince)}` : '',
          ].filter(Boolean).join(' · ');
          return (
            <View
              key={`${card.issuer}_${card.last4}`}
              accessible
              accessibilityLabel={`${card.issuerName} card ${card.last4 || ''}: outstanding ${inr(card.outstanding)}. ${dueText}. ${details}`}
              style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}
            >
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><CreditCard color={c.accent} size={18} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
                    {card.issuerName}{card.last4 ? ` ••${card.last4}` : ''}
                  </Text>
                  <Text style={{ color: tone, fontSize: 13, fontWeight: '600', marginTop: 1 }}>{dueText}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: c.textTertiary, fontSize: 11, fontWeight: '600' }}>Outstanding</Text>
                  <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(card.outstanding)}</Text>
                </View>
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 8 }}>{details}</Text>
            </View>
          );
        })}
        {data.accounts.length > 0 && <Text style={[styles.header, { color: c.textTertiary, marginTop: 10, marginBottom: 0 }]}>Bank balances</Text>}
        {data.accounts.length > 0 && (
          <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, paddingVertical: 4 }, Shadow.card]}>
            {data.accounts.map((a, i) => (
              <View key={a.id} style={[styles.row, { paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}
                accessible accessibilityLabel={`${a.bankName} ${a.last4 || ''} balance ${inr(a.balance)} as of ${when(a.at)}`}>
                <View style={[styles.icon, { backgroundColor: c.backgroundMuted }]}><Landmark color={c.textSecondary} size={18} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{a.bankName}{a.last4 ? ` ••${a.last4}` : ''}</Text>
                  <Text style={{ color: c.textTertiary, fontSize: 12 }}>Balance as of {when(a.at)}</Text>
                </View>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(a.balance)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {settingsLink}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { padding: 28, alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
  icon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
