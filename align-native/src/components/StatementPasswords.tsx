import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CreditCard, FileLock2, Landmark } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { gmailSetStatementPassword, gmailStatements, gmailSyncNow, type StatementBank, type StatementKind, type StatementSlot } from '@/lib/gmail-connect';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (k?: string) => {
  if (!k) return '';
  const [, m, d] = k.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
const KIND_LABEL: Record<StatementKind, string> = { account: 'Bank account statements', card: 'Credit card statements' };

function statusLine(s: StatementSlot): { text: string; bad?: boolean } {
  const st = s.status;
  if (!st) return { text: s.hasPassword ? 'Password saved. Waiting for the next statement email.' : 'No locked statement found yet.' };
  if (st.state === 'ok') return { text: `Read the ${day(st.from)}–${day(st.to)} statement: ${st.rows} transactions, ${st.added} new.` };
  if (st.state === 'needs_password') return { text: 'A statement is waiting: add its PDF password to read it.', bad: true };
  if (st.state === 'wrong_password') return { text: "The saved password didn't open the last statement. Check it and save again.", bad: true };
  return { text: "The last statement couldn't be read (not a text PDF)." };
}

/**
 * Statement PDFs in Gmail are usually locked, and a bank often uses one password for account statements and
 * another for credit card statements. Saving them lets Align open new statements by itself: it adds their
 * transactions (skipping ones already in Align) and the closing balance. Passwords are kept encrypted on the
 * server and never shown again; the PDFs aren't stored.
 */
export default function StatementPasswords({ refreshKey }: { refreshKey: number }) {
  const c = useTheme();
  const [banks, setBanks] = useState<StatementBank[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // "<bank>:<kind>"
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    gmailStatements().then(r => setBanks(r.banks)).catch(() => setBanks([]));
  }, []);
  useEffect(load, [load, refreshKey]);

  const save = async (bank: string, kind: StatementKind, password: string | null) => {
    setBusy(true);
    setNote('');
    try {
      await gmailSetStatementPassword(bank, kind, password);
      setEditing(null);
      setValue('');
      if (password) {
        setNote('Saved. Checking Gmail for statements…');
        const r = await gmailSyncNow().catch(() => null);
        setNote(r ? (r.added ? `Saved. ${r.added} new transaction${r.added === 1 ? '' : 's'} added.` : 'Saved. Statements are read as they arrive.') : 'Saved.');
      } else setNote('Password removed.');
      load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!banks) return <ActivityIndicator color={c.accent} style={{ marginTop: 16 }} />;

  return (
    <View style={[styles.box, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FileLock2 color={c.accent} size={20} />
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Statement passwords</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
        {banks.length
          ? 'Align found these locked statements in your Gmail. Add each one’s PDF password (the bank’s email usually says how it’s made, e.g. part of your name + date of birth, or your customer ID) and Align reads every new statement by itself: transactions (no duplicates) and balance. Passwords are stored encrypted and never shown again; the PDFs aren’t kept.'
          : 'No password-protected statements found in your Gmail yet. When Align finds one (a bank account or credit card statement), it shows up here so you can add its password.'}
      </Text>
      {banks.map(b => (
        <View key={b.id} style={[styles.bank, { borderTopColor: c.border }]}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{b.name}</Text>
          {b.kinds.map(s => {
            const id = `${b.id}:${s.kind}`;
            const line = statusLine(s);
            const open = editing === id;
            const Icon = s.kind === 'card' ? CreditCard : Landmark;
            return (
              <View key={id} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon color={c.textSecondary} size={15} />
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{KIND_LABEL[s.kind]}</Text>
                  {!open && (
                    <Pressable accessibilityRole="button" accessibilityLabel={`${s.hasPassword ? 'Change' : 'Add'} ${b.name} ${KIND_LABEL[s.kind].toLowerCase()} password`}
                      onPress={() => { setEditing(id); setValue(''); setNote(''); }} hitSlop={6}>
                      <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{s.hasPassword ? 'Change' : 'Add password'}</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={{ color: line.bad ? c.expense : c.textTertiary, fontSize: 12, marginTop: 2, marginLeft: 23 }}>
                  {s.hasPassword ? '🔒 Saved · ' : ''}{line.text}
                </Text>
                {open && (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    <TextInput
                      accessibilityLabel={`${b.name} ${KIND_LABEL[s.kind].toLowerCase()} PDF password`}
                      value={value}
                      onChangeText={setValue}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      placeholder={s.kind === 'card' ? 'Credit card statement password' : 'Account statement password'}
                      placeholderTextColor={c.textTertiary}
                      style={{ backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md, fontSize: 16 }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable accessibilityRole="button" disabled={busy || !value.trim()} onPress={() => void save(b.id, s.kind, value)}
                        style={[styles.btn, { backgroundColor: value.trim() ? c.accentFill : c.backgroundMuted }]}>
                        <Text style={{ color: value.trim() ? c.onAccent : c.textTertiary, fontWeight: '700' }}>{busy ? 'Saving…' : 'Save'}</Text>
                      </Pressable>
                      {s.hasPassword && (
                        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save(b.id, s.kind, null)} style={[styles.btn, { backgroundColor: c.backgroundMuted }]}>
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
          })}
        </View>
      ))}
      {!!note && <Text accessibilityLiveRegion="polite" style={{ color: c.textSecondary, fontSize: 13 }}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: 16, gap: 10, marginTop: 16 },
  bank: { borderTopWidth: 1, paddingTop: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center' },
});
