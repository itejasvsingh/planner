import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CreditCard, FileLock2, Landmark, Search } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import {
  gmailCloseBankCards, gmailFindStatements, gmailSetStatementMonths, gmailSetStatementPassword, gmailStatements,
  type StatementGroup, type StatementKind, type StatementLists,
} from '@/lib/gmail-connect';

/** A dropped connection reads better than the browser's own wording ("Load failed", "Failed to fetch"). */
const friendly = (e: unknown) => {
  const m = (e as Error)?.message || '';
  return /load failed|failed to fetch|network|timed? ?out|\(50[234]\)/i.test(m)
    ? 'The connection dropped. Align keeps reading in the background; check back in a minute.'
    : m;
};

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Statements Align found in Gmail (last 3 months unless the user picks 6 or 12), in two lists, bank accounts and credit cards, one row per
 * bank: whether its statements need a password and whether one is saved. Saving it lets Align read every
 * new statement by itself (transactions, no duplicates, and balance). Passwords are stored encrypted on the
 * server and never shown again; the PDFs aren't kept.
 */
export default function StatementPasswords({ refreshKey }: { refreshKey: number }) {
  const c = useTheme();
  const [lists, setLists] = useState<StatementLists | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // "<bank>:<kind>"
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState('');
  /** The password just typed didn't open the statement (shown under the box, which stays open) */
  const [pwError, setPwError] = useState('');

  const load = useCallback(() => {
    gmailStatements().then(setLists).catch(() => setLists(l => l || { accounts: [], cards: [], searched: false }));
  }, []);
  useEffect(load, [load, refreshKey]);

  // While statements are read in the background, refresh the lists a couple of times
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const refreshSoon = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [20_000, 50_000].map(ms => setTimeout(load, ms));
  };

  const find = async () => {
    setFinding(true);
    setNote('');
    try {
      const r = await gmailFindStatements();
      if (r.status !== 'ok') setNote(r.status === 'reconnect' ? 'Connect Gmail again first.' : 'Connect Gmail first.');
      else {
        setLists(r);
        if (r.reading) {
          setNote('Reading new statements in the background; this list updates in about a minute.');
          refreshSoon();
        }
      }
    } catch (e) {
      setNote(friendly(e));
      refreshSoon();
    } finally {
      setFinding(false);
    }
  };

  const save = async (bank: string, kind: StatementKind, password: string | null) => {
    setBusy(true);
    setNote('');
    setPwError('');
    try {
      const r = await gmailSetStatementPassword(bank, kind, password);
      setEditing(null);
      setValue('');
      load();
      if (password) {
        setNote(r.verified
          ? 'Password works: it opened your statement. Align is reading your statements in the background; this list updates in about a minute.'
          : 'Kept, but not checked yet: there’s no statement from this bank in your Gmail to try it on. It’s checked when the next one arrives.');
        refreshSoon();
      } else setNote('Password removed.');
    } catch (e) {
      const m = (e as Error)?.message || '';
      // Wrong password: say so next to the box and let them type it again
      if (/didn.t open/i.test(m)) { setPwError(m); setValue(''); }
      else setNote(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const closeCards = async (bankId: string, bankName: string, closed: boolean) => {
    setNote('');
    try {
      await gmailCloseBankCards(bankId, closed);
      setNote(closed ? `${bankName} cards marked closed: their statements and bills won’t be read.` : `${bankName} cards are open again.`);
      load();
    } catch (e) {
      setNote(friendly(e));
    }
  };

  const setMonths = async (m: 3 | 6 | 12) => {
    setNote('');
    try {
      await gmailSetStatementMonths(m);
      setLists(l => (l ? { ...l, months: m } : l));
      setNote(m === 3 ? 'Reading the last 3 months of statements.' : `Reading statements from the last ${m === 12 ? 'year' : `${m} months`} in the background; new ones appear over the next few checks.`);
      load();
      refreshSoon();
    } catch (e) {
      setNote(friendly(e));
    }
  };

  const row = (g: StatementGroup, i: number) => {
    const id = `${g.bankId}:${g.kind}`;
    const open = editing === id;
    let status: { text: string; color: string };
    if (g.locked === false) status = { text: 'No password needed ✓', color: c.income };
    else if (g.locked === null) status = { text: 'Not checked yet', color: c.textTertiary };
    else if (g.wrongPassword) status = { text: 'Wrong password', color: c.expense };
    else if (g.hasPassword && g.verified) status = { text: '🔒 Password works ✓', color: c.income };
    else if (g.hasPassword) status = { text: '🔒 Password not checked yet', color: c.textSecondary };
    else status = { text: '🔒 Needs password', color: c.expense };
    const action = g.locked === true ? (g.wrongPassword ? 'Try again' : g.hasPassword ? 'Change' : 'Add password') : null;
    return (
      <View key={id} style={[styles.row, { borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{g.bankName}</Text>
            <Text style={{ color: c.textTertiary, fontSize: 12 }}>{g.count} statement{g.count === 1 ? '' : 's'} · latest {day(g.latest)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ color: status.color, fontSize: 12, fontWeight: '700' }}>{status.text}</Text>
            {g.kind === 'card' && !open && (
              <Pressable accessibilityRole="button" accessibilityLabel={`${g.bankName} credit card is closed`} disabled={busy} hitSlop={6}
                onPress={() => void closeCards(g.bankId, g.bankName, true)}>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>Card closed?</Text>
              </Pressable>
            )}
            {action && !open && (
              <Pressable accessibilityRole="button" accessibilityLabel={`${action}: ${g.bankName} ${g.kind === 'card' ? 'credit card' : 'account'} statements`}
                disabled={finding || busy} hitSlop={6}
                onPress={() => {
                  setEditing(id);
                  setValue('');
                  setNote('');
                  setPwError('');
                }}>
                <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>{action}</Text>
              </Pressable>
            )}
          </View>
        </View>
        {!open && g.wrongPassword && (
          <Text style={{ color: c.expense, fontSize: 12, marginTop: 4 }}>The saved password didn’t open the latest statement. Tap Try again and enter it again.</Text>
        )}
        {open && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput
              accessibilityLabel={`${g.bankName} ${g.kind === 'card' ? 'credit card' : 'account'} statement PDF password`}
              value={value}
              onChangeText={setValue}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              placeholder={g.kind === 'card' ? 'Credit card statement password' : 'Account statement password'}
              placeholderTextColor={c.textTertiary}
              style={{ backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md, fontSize: 16, borderWidth: pwError ? 1 : 0, borderColor: c.expense }}
            />
            {!!pwError && <Text accessibilityRole="alert" style={{ color: c.expense, fontSize: 13 }}>{pwError}</Text>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" disabled={busy || !value.trim()} onPress={() => void save(g.bankId, g.kind, value)}
                style={[styles.btn, { backgroundColor: value.trim() ? c.accentFill : c.backgroundMuted }]}>
                <Text style={{ color: value.trim() ? c.onAccent : c.textTertiary, fontWeight: '700' }}>{busy ? 'Saving…' : 'Save'}</Text>
              </Pressable>
              {g.hasPassword && (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save(g.bankId, g.kind, null)} style={[styles.btn, { backgroundColor: c.backgroundMuted }]}>
                  <Text style={{ color: c.expense, fontWeight: '700' }}>Remove</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setEditing(null); setValue(''); setPwError(''); }} style={[styles.btn, { backgroundColor: c.backgroundMuted }]}>
                <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  };

  const list = (title: string, Icon: typeof Landmark, items: StatementGroup[]) => (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon color={c.textSecondary} size={16} />
        <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>{title}</Text>
      </View>
      {items.length ? (
        <View style={[styles.list, { borderColor: c.border }]}>{items.map(row)}</View>
      ) : (
        <Text style={{ color: c.textTertiary, fontSize: 13 }}>None found.</Text>
      )}
    </View>
  );

  if (!lists) return <ActivityIndicator color={c.accent} style={{ marginTop: 16 }} />;
  const any = lists.accounts.length + lists.cards.length > 0;
  const months = (lists.months === 6 || lists.months === 12 ? lists.months : 3) as 3 | 6 | 12;
  const span = months === 12 ? 'last year' : `last ${months} months`;

  return (
    <View style={[styles.box, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FileLock2 color={c.accent} size={20} />
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Statements</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
        {any
          ? `Statements from your banks in the ${span}. Add the PDF password where one is needed (the bank’s email says how it’s made) and Align reads every new statement by itself. Passwords are stored encrypted and never shown again; the PDFs aren’t kept.`
          : lists.searched
            ? `No statement PDFs from your banks in the ${span}.`
            : `Find the statements your banks emailed you in the ${span}, and which of them need a password.`}
      </Text>
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.textTertiary, fontSize: 12 }}>Read statements from</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([3, 6, 12] as const).map(m => (
            <Pressable key={m} accessibilityRole="radio" accessibilityState={{ checked: months === m }} onPress={() => months !== m && void setMonths(m)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: months === m ? c.accentFill : c.border, backgroundColor: months === m ? c.accentFill : 'transparent' }}>
              <Text style={{ color: months === m ? c.onAccent : c.text, fontSize: 12, fontWeight: '600' }}>{m === 12 ? '1 year' : `${m} months`}{m === 3 ? ' (default)' : ''}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable accessibilityRole="button" disabled={finding} onPress={() => void find()}
        style={[styles.btn, { backgroundColor: c.accentSoft, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}>
        {finding ? <ActivityIndicator color={c.accent} size="small" /> : <Search color={c.accent} size={16} />}
        <Text style={{ color: c.accent, fontWeight: '700' }}>{finding ? 'Searching Gmail…' : any ? `Search again (${span})` : `Find statements (${span})`}</Text>
      </Pressable>
      {any && list('Bank accounts', Landmark, lists.accounts)}
      {any && list('Credit cards', CreditCard, lists.cards)}
      {!!lists.closedCards?.length && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Closed cards</Text>
          {lists.closedCards.map(b => (
            <View key={b.bankId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: c.textSecondary, fontSize: 14, flex: 1 }}>{b.bankName} · not read</Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void closeCards(b.bankId, b.bankName, false)} hitSlop={6}>
                <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>Reopen</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {!!note && <Text accessibilityLiveRegion="polite" style={{ color: c.textSecondary, fontSize: 13 }}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: 16, gap: 12, marginTop: 16 },
  list: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12 },
  row: { paddingVertical: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center' },
});
