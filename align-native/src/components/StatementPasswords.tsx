import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { FileLock2 } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { gmailSetStatementPassword, gmailStatements, gmailSyncNow, type StatementBank } from '@/lib/gmail-connect';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (k?: string) => {
  if (!k) return '';
  const [, m, d] = k.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

function statusLine(b: StatementBank): { text: string; bad?: boolean } {
  const s = b.status;
  if (!s) return { text: b.hasPassword ? 'Password saved. Waiting for the next statement email.' : 'No locked statement found yet.' };
  if (s.state === 'ok') return { text: `Read the ${day(s.from)}–${day(s.to)} statement: ${s.rows} transactions, ${s.added} new.` };
  if (s.state === 'needs_password') return { text: 'A statement is waiting: add its PDF password to read it.', bad: true };
  if (s.state === 'wrong_password') return { text: "The saved password didn't open the last statement. Check it and save again.", bad: true };
  return { text: "The last statement couldn't be read (not a text PDF)." };
}

/**
 * Statement PDFs in Gmail are usually locked. Saving each bank's PDF password lets Align open new statements
 * by itself: it adds their transactions (skipping ones already in Align) and the closing balance. Passwords
 * are kept encrypted on the server and never shown again; the PDFs aren't stored.
 */
export default function StatementPasswords({ refreshKey }: { refreshKey: number }) {
  const c = useTheme();
  const [banks, setBanks] = useState<StatementBank[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    gmailStatements().then(r => setBanks(r.banks)).catch(() => setBanks([]));
  }, []);
  useEffect(load, [load, refreshKey]);

  const save = async (bank: string, password: string | null) => {
    setBusy(true);
    setNote('');
    try {
      await gmailSetStatementPassword(bank, password);
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
  if (!banks.length) return null;

  return (
    <View style={[styles.box, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <FileLock2 color={c.accent} size={20} />
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Statement passwords</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
        Banks email statements as locked PDFs. Save a bank's PDF password and Align reads each new statement by itself:
        its transactions (no duplicates) and closing balance. Passwords are stored encrypted and never shown again; the PDFs aren't kept.
      </Text>
      {banks.map(b => {
        const line = statusLine(b);
        const open = editing === b.id;
        return (
          <View key={b.id} style={[styles.bank, { borderTopColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: '600', fontSize: 15, flex: 1 }}>{b.name}</Text>
              {!open && (
                <Pressable accessibilityRole="button" accessibilityLabel={`${b.hasPassword ? 'Change' : 'Add'} ${b.name} statement password`} onPress={() => { setEditing(b.id); setValue(''); setNote(''); }} hitSlop={6}>
                  <Text style={{ color: c.accent, fontWeight: '700' }}>{b.hasPassword ? 'Change' : 'Add password'}</Text>
                </Pressable>
              )}
            </View>
            <Text style={{ color: line.bad ? c.expense : c.textTertiary, fontSize: 12, marginTop: 2 }}>
              {b.hasPassword ? '🔒 Saved · ' : ''}{line.text}
            </Text>
            {open && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <TextInput
                  accessibilityLabel={`${b.name} statement PDF password`}
                  value={value}
                  onChangeText={setValue}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  placeholder="PDF password"
                  placeholderTextColor={c.textTertiary}
                  style={{ backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md, fontSize: 16 }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable accessibilityRole="button" disabled={busy || !value.trim()} onPress={() => void save(b.id, value)}
                    style={[styles.btn, { backgroundColor: value.trim() ? c.accentFill : c.backgroundMuted }]}>
                    <Text style={{ color: value.trim() ? c.onAccent : c.textTertiary, fontWeight: '700' }}>{busy ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                  {b.hasPassword && (
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save(b.id, null)} style={[styles.btn, { backgroundColor: c.backgroundMuted }]}>
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
      {!!note && <Text accessibilityLiveRegion="polite" style={{ color: c.textSecondary, fontSize: 13 }}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: 16, gap: 10, marginTop: 16 },
  bank: { borderTopWidth: 1, paddingTop: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center' },
});
