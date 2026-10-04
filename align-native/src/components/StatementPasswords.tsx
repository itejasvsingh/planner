import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CreditCard, FileLock2, Landmark, Search } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import {
  gmailBanks, gmailFindStatements, gmailSaveBanks, gmailSetStatementPassword, gmailStatements,
  type StatementGroup, type StatementKind, type StatementLists,
} from '@/lib/gmail-connect';

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Statements Align found in Gmail (last 90 days), in two lists, bank accounts and credit cards, one row per
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

  const load = useCallback(() => {
    gmailStatements().then(setLists).catch(() => setLists({ accounts: [], cards: [], searched: false }));
  }, []);
  useEffect(load, [load, refreshKey]);

  const find = async () => {
    setFinding(true);
    setNote('');
    try {
      const r = await gmailFindStatements();
      if (r.status !== 'ok') setNote(r.status === 'reconnect' ? 'Connect Gmail again first.' : 'Connect Gmail first.');
      else {
        setLists(r);
        setNote(r.added ? `${r.added} new transaction${r.added === 1 ? '' : 's'} added from statements.` : '');
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setFinding(false);
    }
  };

  // A bank you haven't ticked: add it so its statements are read
  const addBank = async (bankId: string) => {
    setFinding(true);
    try {
      const cur = await gmailBanks();
      const selected = cur.selected && cur.selected.length ? cur.selected : cur.banks.map(b => b.id);
      const id = bankId.startsWith('in_') ? 'otherbankin' : bankId;
      if (!selected.includes(id)) await gmailSaveBanks([...selected, id], cur.extra);
    } catch (e) {
      setNote((e as Error).message);
    }
    await find();
  };

  const save = async (bank: string, kind: StatementKind, password: string | null) => {
    setBusy(true);
    setNote('');
    try {
      await gmailSetStatementPassword(bank, kind, password);
      setEditing(null);
      setValue('');
      setNote(password ? 'Saved. Reading the statements…' : 'Password removed.');
      if (password) await find();
      else load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const row = (g: StatementGroup, i: number) => {
    const id = `${g.bankId}:${g.kind}`;
    const open = editing === id;
    let status: { text: string; color: string };
    if (!g.selected) status = { text: 'Not in your banks', color: c.textSecondary };
    else if (g.locked === false) status = { text: 'No password needed ✓', color: c.income };
    else if (g.locked === null) status = { text: 'Not checked yet', color: c.textTertiary };
    else if (g.wrongPassword) status = { text: 'Password didn’t work', color: c.expense };
    else if (g.hasPassword) status = { text: '🔒 Password saved ✓', color: c.income };
    else status = { text: '🔒 Needs password', color: c.expense };
    const action = !g.selected ? 'Add bank' : g.locked === true ? (g.hasPassword ? 'Change' : 'Add password') : null;
    return (
      <View key={id} style={[styles.row, { borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{g.bankName}</Text>
            <Text style={{ color: c.textTertiary, fontSize: 12 }}>{g.count} statement{g.count === 1 ? '' : 's'} · latest {day(g.latest)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ color: status.color, fontSize: 12, fontWeight: '700' }}>{status.text}</Text>
            {action && !open && (
              <Pressable accessibilityRole="button" accessibilityLabel={`${action}: ${g.bankName} ${g.kind === 'card' ? 'credit card' : 'account'} statements`}
                disabled={finding || busy} hitSlop={6}
                onPress={() => {
                  if (action === 'Add bank') return void addBank(g.bankId);
                  setEditing(id);
                  setValue('');
                  setNote('');
                }}>
                <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>{action}</Text>
              </Pressable>
            )}
          </View>
        </View>
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
              style={{ backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md, fontSize: 16 }}
            />
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
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setEditing(null); setValue(''); }} style={[styles.btn, { backgroundColor: c.backgroundMuted }]}>
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

  return (
    <View style={[styles.box, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FileLock2 color={c.accent} size={20} />
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Statements</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
        {any
          ? 'Statements from your banks in the last 90 days. Add the PDF password where one is needed (the bank’s email says how it’s made) and Align reads every new statement by itself. Passwords are stored encrypted and never shown again; the PDFs aren’t kept.'
          : lists.searched
            ? 'No statement PDFs from your banks in the last 90 days.'
            : 'Find the statements your banks emailed you in the last 90 days, and which of them need a password.'}
      </Text>
      <Pressable accessibilityRole="button" disabled={finding} onPress={() => void find()}
        style={[styles.btn, { backgroundColor: c.accentSoft, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}>
        {finding ? <ActivityIndicator color={c.accent} size="small" /> : <Search color={c.accent} size={16} />}
        <Text style={{ color: c.accent, fontWeight: '700' }}>{finding ? 'Searching Gmail…' : any ? 'Search again (last 90 days)' : 'Find statements (last 90 days)'}</Text>
      </Pressable>
      {any && list('Bank accounts', Landmark, lists.accounts)}
      {any && list('Credit cards', CreditCard, lists.cards)}
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
