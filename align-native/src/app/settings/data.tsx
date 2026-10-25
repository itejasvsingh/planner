import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { deleteMyAccount, downloadMyData } from '@/lib/account-data';
import { removeItem } from '@/lib/storage';
import { triggerHaptic } from '@/lib/haptics';

/** Settings → Your data: take a copy of everything Align keeps about you, or delete the account and all of it for good. */
export default function YourDataScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = usePhone();
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState('');
  const [arming, setArming] = useState(false);

  const download = async () => {
    setBusy('download');
    setNote(null);
    try {
      await downloadMyData();
      setNote({ ok: true, text: 'Done. Your data is in the file (it leaves out passwords and keys).' });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setNote(null);
    try {
      await deleteMyAccount(confirm.trim());
      triggerHaptic('success');
      // Gone on the server; clear what this device remembers and go back to the start
      for (const k of ['align_saved_places', 'align_auto_pin', 'planner_user_phone', 'align_verified_phone']) await removeItem(k);
      await logout();
      router.replace('/welcome' as any);
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
      setBusy(null);
    }
  };

  const card = [styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];
  const armed = confirm.trim().toUpperCase() === 'DELETE';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Download</Text>
      <View style={[card, { padding: 14, gap: 10 }]}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>Download my data</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
          One file with your transactions, tasks, settings, balances, cards and statement records. It leaves out passwords and keys.
        </Text>
        <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void download()} style={[styles.button, { backgroundColor: theme.accentFill, opacity: busy ? 0.7 : 1 }]}>
          {busy === 'download' ? <ActivityIndicator color={theme.onAccent} /> : <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 16 }}>Download</Text>}
        </Pressable>
      </View>

      <Text style={[styles.title, { color: theme.textSecondary, marginTop: 24 }]}>Delete</Text>
      <View style={[card, { padding: 14, gap: 10, borderColor: theme.expense }]}>
        <Text style={{ color: theme.expense, fontSize: 15, fontWeight: '700' }}>Delete my account</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
          This removes your account and everything in it from Align for good: transactions, tasks, settings, balances, cards, statement records, your Gmail connection and your sign-in. It can’t be undone. Download your data first if you want a copy.
        </Text>
        {arming ? (
          <>
            <Text style={{ color: theme.text, fontSize: 13 }}>Type DELETE to confirm.</Text>
            <TextInput
              accessibilityLabel="Type DELETE to confirm"
              value={confirm}
              onChangeText={t => { setConfirm(t); setNote(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
            />
            <Pressable accessibilityRole="button" disabled={!armed || busy !== null} onPress={() => void remove()}
              style={[styles.button, { backgroundColor: armed ? theme.expenseFill : theme.backgroundMuted, opacity: busy ? 0.7 : 1 }]}>
              {busy === 'delete' ? <ActivityIndicator color="#fff" /> : <Text style={{ color: armed ? '#FFFFFF' : theme.textTertiary, fontWeight: '700', fontSize: 16 }}>Delete everything</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setArming(false); setConfirm(''); }} style={{ alignSelf: 'center', padding: 6 }}>
              <Text style={{ color: theme.accent, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setArming(true)} style={[styles.button, { backgroundColor: theme.expenseSoft }]}>
            <Text style={{ color: theme.expense, fontWeight: '700', fontSize: 16 }}>Delete my account…</Text>
          </Pressable>
        )}
      </View>
      {note ? <Text accessibilityLiveRegion="polite" style={{ color: note.ok ? theme.income : theme.expense, marginTop: 12, fontSize: 14 }}>{note.text}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 16, marginBottom: 7 },
  card: { borderRadius: 14, borderWidth: 1 },
  button: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
