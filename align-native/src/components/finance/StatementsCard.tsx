import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BellRing, CreditCard, FileText, Landmark } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import StatementPasswords from '@/components/StatementPasswords';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { whenSignedIn } from '@/lib/firebase';
import { editCard, gmailFindStatements, gmailStatements, type CardSummary, type StatementLists } from '@/lib/gmail-connect';
import { inr, shortDay } from '@/lib/card-format';
import { previousStatement, summarizeStatement, type StatementRecord } from '@/lib/statement-summary';

// Gmail is searched for statements at most once a day from here (the search itself is rate-limited on the server)
let searchedThisSession = false;
const DAY = 86_400_000;

const span = (r: StatementRecord) => (r.from && r.to ? `${shortDay(r.from)} – ${shortDay(r.to)}` : '');

/**
 * Wallet → Statements: the bank and card statements Align found in Gmail (last 3 months by default). Asks for the PDF
 * passwords it still needs, then for each statement it read: what went out and came in, the top categories and shops,
 * the biggest spend, the change from the previous one, and for a card what's due and by when (with reminders).
 * Worked out on the phone from the transactions; nothing is sent to an AI.
 */
export default function StatementsCard({ items, cards, onCardsChanged }: {
  items: any[];
  cards: CardSummary[];
  onCardsChanged: () => void;
}) {
  const c = useTheme();
  const [lists, setLists] = useState<StatementLists | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    gmailStatements().then(setLists).catch(() => setLists(null));
  }, []);
  // After sign-in is restored (a request before that is refused)
  useEffect(() => whenSignedIn(() => { load(); }), [load, refreshKey]);

  // First visit (or a day later): look for new statements in Gmail, so the ones needing a password are asked for here
  useEffect(() => {
    if (!lists || searchedThisSession) return;
    const stale = !lists.searched || !lists.searchedAt || Date.now() - lists.searchedAt > DAY;
    if (!stale) return;
    searchedThisSession = true;
    gmailFindStatements()
      .then(r => { if (r.status === 'ok') setRefreshKey(k => k + 1); })
      .catch(() => {});
  }, [lists]);

  const read = useMemo(() => (lists?.read || []), [lists]);
  const summaries = useMemo(
    () => read.filter(r => r.state === 'ok').map(r => ({ rec: r, sum: summarizeStatement(items, r, previousStatement(read, r)) })),
    [read, items],
  );
  const unreadable = read.filter(r => r.state === 'unreadable');
  const cardFor = (r: StatementRecord) => cards.find(k => k.issuer === r.bankId && (!r.last4 || k.last4 === r.last4) && !k.closed);

  const remind = async (card: CardSummary) => {
    setBusy(card.key);
    try {
      await editCard(card.key, { remind: true });
      onCardsChanged();
    } finally {
      setBusy(null);
    }
  };

  if (!lists) return null;
  const nothing = !summaries.length && !unreadable.length;

  return (
    <View style={{ gap: 12, marginBottom: 16 }}>
      <StatementPasswords mode="pending" refreshKey={refreshKey} onChanged={() => { setTimeout(() => setRefreshKey(k => k + 1), 30_000); }} />

      {!nothing && <Text style={[styles.header, { color: c.textTertiary }]}>Statements</Text>}
      {summaries.map(({ rec, sum }) => {
        // What's due belongs to the newest statement of that card only
        const newest = !summaries.some(o => o.rec !== rec && o.rec.bankId === rec.bankId && o.rec.kind === rec.kind && o.rec.last4 === rec.last4 && (o.rec.to || '') > (rec.to || ''));
        const card = rec.kind === 'card' && newest ? cardFor(rec) : undefined;
        const billLeft = card ? Math.max(0, Math.round((card.totalDue - card.paidSince) * 100) / 100) : 0;
        const Icon = rec.kind === 'card' ? CreditCard : Landmark;
        const name = `${rec.bankName}${rec.product ? ` ${rec.product}` : ''} ${rec.kind === 'card' ? 'card' : 'account'}${rec.last4 ? ` ••${rec.last4}` : ''}`;
        return (
          <View key={rec.id} style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><Icon color={c.accent} size={18} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{name}</Text>
                <Text style={{ color: c.textTertiary, fontSize: 12 }}>{span(rec)}{rec.rows ? ` · ${rec.rows} transactions read` : ''}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[styles.stat, { backgroundColor: c.backgroundMuted }]}>
                <Text style={[styles.statLabel, { color: c.textTertiary }]}>Spent</Text>
                <Text style={[styles.statValue, { color: c.text }]}>{inr(sum.spent)}</Text>
                {sum.change !== null && (
                  <Text style={{ color: sum.change > 0 ? c.expense : c.income, fontSize: 11, fontWeight: '700' }}>
                    {sum.change > 0 ? '▲' : '▼'} {Math.abs(Math.round(sum.change * 100))}% vs last
                  </Text>
                )}
              </View>
              <View style={[styles.stat, { backgroundColor: c.backgroundMuted }]}>
                <Text style={[styles.statLabel, { color: c.textTertiary }]}>{rec.kind === 'card' ? 'Refunds & payments' : 'Received'}</Text>
                <Text style={[styles.statValue, { color: c.text }]}>{inr(sum.received)}</Text>
              </View>
            </View>

            {sum.categories.length > 0 && (
              <View style={{ gap: 4 }}>
                <Text style={[styles.sub, { color: c.textTertiary }]}>Where it went</Text>
                {sum.categories.map(k => (
                  <View key={k.name} style={styles.line}>
                    <Text style={{ color: c.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{k.name}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 14, fontVariant: ['tabular-nums'] }}>{inr(k.total)}</Text>
                  </View>
                ))}
              </View>
            )}
            {sum.shops.length > 0 && (
              <View style={{ gap: 4 }}>
                <Text style={[styles.sub, { color: c.textTertiary }]}>Top places</Text>
                {sum.shops.map(k => (
                  <View key={k.name} style={styles.line}>
                    <Text style={{ color: c.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{k.name}{k.count > 1 ? ` ×${k.count}` : ''}</Text>
                    <Text style={{ color: c.textSecondary, fontSize: 14, fontVariant: ['tabular-nums'] }}>{inr(k.total)}</Text>
                  </View>
                ))}
              </View>
            )}
            {sum.biggest && (
              <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                Biggest: {sum.biggest.title}, {inr(sum.biggest.amount)}{sum.biggest.date ? ` on ${shortDay(sum.biggest.date)}` : ''}
              </Text>
            )}
            {!sum.count && <Text style={{ color: c.textSecondary, fontSize: 13 }}>No spends on it.</Text>}

            {rec.kind === 'card' && newest && !(card && card.dueDate) && (rec.bill ? (
              <View style={[styles.due, { backgroundColor: c.accentSoft }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{inr(rec.bill.totalDue)} to pay by {shortDay(rec.bill.dueDate)}</Text>
                  {rec.bill.minDue ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>Minimum {inr(rec.bill.minDue)}</Text> : null}
                </View>
              </View>
            ) : rec.billFound === false ? (
              <View style={{ gap: 2 }}>
                <Text style={{ color: c.expense, fontSize: 13 }}>Align couldn’t find the due date and amount in this statement.</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>Tap “Add a card” under Credit cards below and type them in once; Align reminds you from that.</Text>
              </View>
            ) : null)}
            {card && card.dueDate && (
              <View style={[styles.due, { backgroundColor: card.status === 'paid' ? c.backgroundMuted : c.accentSoft }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>
                    {card.status === 'paid' || billLeft <= 0 ? 'Paid ✓' : `${inr(billLeft)} to pay by ${shortDay(card.dueDate)}`}
                  </Text>
                  {card.status !== 'paid' && card.minDue ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>Minimum {inr(card.minDue)}</Text> : null}
                </View>
                {card.status !== 'paid' && (card.remind ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <BellRing color={c.income} size={14} />
                    <Text style={{ color: c.income, fontSize: 12, fontWeight: '700' }}>Reminder on</Text>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" disabled={busy === card.key} onPress={() => void remind(card)}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: c.accentFill }}>
                    <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 12 }}>{busy === card.key ? 'Saving…' : 'Remind me'}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {unreadable.map(r => (
        <View key={r.id} style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: c.backgroundMuted }]}><FileText color={c.textSecondary} size={18} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{r.bankName} {r.kind === 'card' ? 'card' : 'account'}{r.last4 ? ` ••${r.last4}` : ''}</Text>
              <Text style={{ color: c.expense, fontSize: 13 }}>Opened, but Align couldn’t read this statement’s layout yet.</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, borderRadius: Radius.md, padding: 10, gap: 2 },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  line: { flexDirection: 'row', gap: 8 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.md, padding: 12 },
});
