import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BellRing, ChevronDown, ChevronRight, CreditCard, FileText, Landmark } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import StatementPasswords from '@/components/StatementPasswords';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { whenSignedIn } from '@/lib/firebase';
import { editCard, gmailFindStatements, gmailStatements, type CardSummary, type StatementLists } from '@/lib/gmail-connect';
import { inr, shortDay } from '@/lib/card-format';
import { previousStatement, statementRows, summarizeStatement, type StatementRecord } from '@/lib/statement-summary';

// Gmail is searched for statements at most once a day from here (the search itself is rate-limited on the server)
let searchedThisSession = false;
const DAY = 86_400_000;

const span = (r: StatementRecord) => (r.from && r.to ? `${shortDay(r.from)} – ${shortDay(r.to)}` : '');
type Check = { slot: string; extras: { title: string; amount: number; date: string }[]; checked: boolean };

/**
 * Wallet → Statements. `section="pending"`: a box at the top, only when a statement still needs its PDF password
 * (or the saved one is wrong). `section="list"`: the statements Align read (last 3 months by default), one compact
 * row each; tap a row for the statement's own summary, spent / refunds / fees, top categories, every transaction,
 * and (a card's latest) what's due with a reminder. Worked out on the phone; nothing goes to an AI.
 */
export default function StatementsCard({ section, items, cards, checks = [], onCardsChanged }: {
  section: 'pending' | 'list';
  items: any[];
  cards: CardSummary[];
  /** What each statement was compared with (alerts the statement doesn't have) */
  checks?: Check[];
  onCardsChanged: () => void;
}) {
  const c = useTheme();
  const [lists, setLists] = useState<StatementLists | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<string | null>(null);
  const [older, setOlder] = useState(false);

  const load = useCallback(() => {
    gmailStatements().then(setLists).catch(() => setLists(null));
  }, []);
  // After sign-in is restored (a request before that is refused)
  useEffect(() => whenSignedIn(() => { load(); }), [load, refreshKey]);

  // First visit (or a day later): look for new statements in Gmail, so the ones needing a password are asked for here
  useEffect(() => {
    if (section !== 'pending' || !lists || searchedThisSession) return;
    const stale = !lists.searched || !lists.searchedAt || Date.now() - lists.searchedAt > DAY;
    if (!stale) return;
    searchedThisSession = true;
    gmailFindStatements()
      .then(r => { if (r.status === 'ok') setRefreshKey(k => k + 1); })
      .catch(() => {});
  }, [lists, section]);

  const read = useMemo(() => lists?.read || [], [lists]);
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

  if (section === 'pending') {
    return <StatementPasswords mode="pending" refreshKey={refreshKey} onChanged={() => { setTimeout(() => setRefreshKey(k => k + 1), 30_000); }} />;
  }
  if (!lists || (!summaries.length && !unreadable.length)) return null;

  const shown = older ? summaries : summaries.slice(0, 3);

  const detail = (rec: StatementRecord, sum: ReturnType<typeof summarizeStatement>, newest: boolean) => {
    const card = rec.kind === 'card' && newest ? cardFor(rec) : undefined;
    const billLeft = card ? Math.max(0, Math.round((card.totalDue - card.paidSince) * 100) / 100) : 0;
    const rows = statementRows(items, rec);
    const rowsShown = allRows === rec.id ? rows : rows.slice(0, 8);
    const b = rec.breakdown;
    const slot = rec.kind === 'card' ? `${rec.bankId}__card` : rec.bankId;
    const check = checks.find(k => k.slot === slot);
    return (
      <View style={{ gap: 12, paddingTop: 10 }}>
        {b && (
          <View style={[styles.box, { backgroundColor: c.backgroundMuted }]}>
            {([['Previous balance', b.previous, ''], ['Payments & credits received', b.payments, '−'], ['Purchases', b.purchases, '+'], ['Finance charges', b.charges, '+']] as [string, number | undefined, string][])
              .filter(([, v]) => v !== undefined).map(([label, v, sign]) => (
                <View key={label} style={styles.line}>
                  <Text style={{ color: c.textSecondary, fontSize: 13, flex: 1 }}>{sign ? `${sign} ` : ''}{label}</Text>
                  <Text style={{ color: c.text, fontSize: 13, fontVariant: ['tabular-nums'] }}>{inr(v as number)}</Text>
                </View>
              ))}
            {rec.bill && (
              <View style={[styles.line, { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6 }]}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }}>= Total due</Text>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(rec.bill.totalDue)}</Text>
              </View>
            )}
          </View>
        )}

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
          {sum.refunds > 0 && (
            <View style={[styles.stat, { backgroundColor: c.backgroundMuted }]}>
              <Text style={[styles.statLabel, { color: c.textTertiary }]}>Refunds</Text>
              <Text style={[styles.statValue, { color: c.income }]}>{inr(sum.refunds)}</Text>
            </View>
          )}
          {sum.fees > 0 && (
            <View style={[styles.stat, { backgroundColor: c.backgroundMuted }]}>
              <Text style={[styles.statLabel, { color: c.textTertiary }]}>Fees & interest</Text>
              <Text style={[styles.statValue, { color: c.expense }]}>{inr(sum.fees)}</Text>
            </View>
          )}
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
        {sum.biggest && (
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            Biggest: {sum.biggest.title}, {inr(sum.biggest.amount)}{sum.biggest.date ? ` on ${shortDay(sum.biggest.date)}` : ''}
          </Text>
        )}

        {rows.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={[styles.sub, { color: c.textTertiary }]}>All {rows.length} transactions</Text>
            {rowsShown.map(r => (
              <View key={r.id} style={styles.line}>
                <Text style={{ color: c.textTertiary, fontSize: 12, width: 44 }}>{r.date ? shortDay(r.date) : ''}</Text>
                <Text style={{ color: r.kind === 'spend' ? c.text : c.textSecondary, fontSize: 14, flex: 1 }} numberOfLines={1}>
                  {r.title}{r.kind === 'fee' ? ' · fee' : r.kind === 'refund' ? ' · refund' : ''}
                </Text>
                <Text style={{ color: r.kind === 'refund' ? c.income : r.kind === 'fee' ? c.expense : c.text, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                  {r.kind === 'refund' ? '+' : ''}{inr(r.amount)}
                </Text>
              </View>
            ))}
            {rows.length > 8 && (
              <Pressable accessibilityRole="button" onPress={() => setAllRows(allRows === rec.id ? null : rec.id)} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{allRows === rec.id ? 'Show fewer' : `Show all ${rows.length}`}</Text>
              </Pressable>
            )}
          </View>
        )}
        {!rows.length && <Text style={{ color: c.textSecondary, fontSize: 13 }}>No transactions on this card or account in these dates yet.</Text>}

        {check && check.checked && check.extras.length > 0 && (
          <Text style={{ color: c.expense, fontSize: 12 }}>
            {check.extras.length} payment{check.extras.length === 1 ? '' : 's'} from alerts {check.extras.length === 1 ? 'isn’t' : 'aren’t'} on this statement:{' '}
            {check.extras.slice(0, 3).map(x => `${x.title} ${inr(x.amount)}`).join(', ')}. Check for a duplicate or another account.
          </Text>
        )}

        {rec.kind === 'card' && newest && (card && card.dueDate ? (
          <View style={[styles.due, { backgroundColor: card.status === 'paid' || billLeft <= 0 ? c.incomeSoft : card.status === 'overdue' ? c.expenseSoft : card.daysLeft !== null && card.daysLeft <= 3 ? c.warningSoft : c.accentSoft }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: card.status === 'paid' || billLeft <= 0 ? c.income : card.status === 'overdue' ? c.expense : card.daysLeft !== null && card.daysLeft <= 3 ? c.warning : c.text, fontWeight: '700', fontSize: 14 }}>
                {card.status === 'paid' || billLeft <= 0 ? 'Paid ✓' : `${inr(billLeft)} ${card.status === 'overdue' ? 'was due' : 'to pay by'} ${shortDay(card.dueDate)}`}
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
        ) : rec.bill ? (
          <View style={[styles.due, { backgroundColor: c.accentSoft }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{inr(rec.bill.totalDue)} to pay by {shortDay(rec.bill.dueDate)}</Text>
              {rec.bill.minDue ? <Text style={{ color: c.textSecondary, fontSize: 12 }}>Minimum {inr(rec.bill.minDue)}</Text> : null}
            </View>
          </View>
        ) : rec.billFound === false ? (
          <View style={{ gap: 2 }}>
            <Text style={{ color: c.expense, fontSize: 13 }}>Align couldn’t find the due date and amount in this statement.</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>Tap “Add a card” under Credit cards and type them in once; Align reminds you from that.</Text>
          </View>
        ) : null)}
      </View>
    );
  };

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <Text style={[styles.header, { color: c.textTertiary }]}>Statements</Text>
      <View style={[styles.list, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        {shown.map(({ rec, sum }, i) => {
          const newest = !summaries.some(o => o.rec !== rec && o.rec.bankId === rec.bankId && o.rec.kind === rec.kind && o.rec.last4 === rec.last4 && (o.rec.to || '') > (rec.to || ''));
          const isOpen = open === rec.id;
          const Icon = rec.kind === 'card' ? CreditCard : Landmark;
          const name = `${rec.bankName}${rec.product ? ` ${rec.product}` : ''}${rec.last4 ? ` ••${rec.last4}` : ''}`;
          const due = rec.kind === 'card' && newest && rec.bill ? `Due ${shortDay(rec.bill.dueDate)}` : '';
          const liveCard = rec.kind === 'card' && newest ? cardFor(rec) : undefined;
          // The due part of the line: red overdue, amber within 3 days, green paid
          const dueFg = !due ? c.textTertiary : liveCard?.status === 'paid' ? c.income : liveCard?.status === 'overdue' ? c.expense : liveCard?.daysLeft != null && liveCard.daysLeft <= 3 ? c.warning : c.textTertiary;
          return (
            <View key={rec.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${name} statement ${span(rec)}, spent ${inr(sum.spent)}${due ? `, ${due}` : ''}`}
                onPress={() => setOpen(isOpen ? null : rec.id)} style={styles.row}>
                <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><Icon color={c.accent} size={16} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{name}</Text>
                  <Text style={{ color: c.textTertiary, fontSize: 12 }}>{span(rec)}{due ? <Text style={{ color: dueFg, fontWeight: dueFg === c.textTertiary ? '400' : '700' }}>{` · ${liveCard?.status === 'paid' ? 'Paid' : liveCard?.status === 'overdue' ? 'Overdue' : due}`}</Text> : null}</Text>
                </View>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] }}>{inr(sum.spent)}</Text>
                {isOpen ? <ChevronDown color={c.textTertiary} size={16} /> : <ChevronRight color={c.textTertiary} size={16} />}
              </Pressable>
              {isOpen && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{detail(rec, sum, newest)}</View>}
            </View>
          );
        })}
        {unreadable.map((r, i) => (
          <View key={r.id} style={[styles.row, { borderTopWidth: shown.length || i ? 1 : 0, borderTopColor: c.border }]}>
            <View style={[styles.icon, { backgroundColor: c.backgroundMuted }]}><FileText color={c.textSecondary} size={16} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{r.bankName}{r.last4 ? ` ••${r.last4}` : ''}</Text>
              <Text style={{ color: c.expense, fontSize: 12 }}>Opened, but couldn’t read this statement’s layout yet</Text>
            </View>
          </View>
        ))}
      </View>
      {summaries.length > 3 && (
        <Pressable accessibilityRole="button" onPress={() => setOlder(!older)} hitSlop={8} style={{ alignSelf: 'center' }}>
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{older ? 'Show fewer' : `Show ${summaries.length - 3} older`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  list: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  box: { borderRadius: Radius.md, padding: 10, gap: 4 },
  stat: { flex: 1, borderRadius: Radius.md, padding: 10, gap: 2 },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  line: { flexDirection: 'row', gap: 8 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.md, padding: 12 },
});
