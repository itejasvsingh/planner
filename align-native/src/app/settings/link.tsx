import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';

const isStandIn = (p: string | null) => /^910\d{9}$/.test(String(p || ''));
const mask = (p: string) => `+${p.slice(0, p.length - 10)} ••••• ${p.slice(-5)}`;

/**
 * Settings → Linked sign-ins: one account, two ways in. An account that signs in with a WhatsApp number can add an email,
 * and an email account can add its WhatsApp number (its data moves to that number). Either way each side is proved with
 * a code, and afterwards either one opens the same account.
 */
export default function LinkScreen() {
  const theme = useTheme();
  const { phone, firebaseUser, sendCode, verifyCode, sendEmailCode, linkEmail } = usePhone();
  const [email, setEmail] = useState<string | null>(null);
  // Reads the account's email from its sign-in token; `force` fetches a fresh token (after linking)
  const readEmail = async (force = false) => {
    try {
      const r = await firebaseUser?.getIdTokenResult(force);
      setEmail(typeof r?.claims.loginEmail === 'string' ? r.claims.loginEmail : null);
    } catch { /* keep what's shown */ }
  };
  useEffect(() => { void readEmail(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, phone]);

  const emailOnly = isStandIn(phone);
  const hasPhone = !!phone && !emailOnly && phone !== 'guest';
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    setBusy(true);
    setNote(null);
    const res = emailOnly ? await sendCode(value) : await sendEmailCode(value);
    setBusy(false);
    if (!res.ok) return setNote({ ok: false, text: res.message });
    setStep('code');
    setCode('');
  };
  const confirm = async (c = code) => {
    if (c.length !== 6) return setNote({ ok: false, text: 'Enter the 6-digit code.' });
    setBusy(true);
    setNote(null);
    const res = emailOnly ? await verifyCode(value, c) : await linkEmail(value, c);
    setBusy(false);
    if (!res.ok) return setNote({ ok: false, text: res.message });
    setStep('enter');
    setValue('');
    await readEmail(true);
    setNote({ ok: true, text: emailOnly ? 'Your WhatsApp number is linked. Your data moved with it.' : 'Your email is linked. It now opens this same account.' });
  };

  const card = [styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];
  const input = [styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }];
  const both = hasPhone && !!email;

  return (
    <ScrollView style={[styles.scroll, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Signs in with</Text>
      <View style={card}>
        <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.text }]}>WhatsApp number</Text>
          <Text style={{ color: hasPhone ? theme.text : theme.textTertiary }}>{hasPhone ? mask(phone!) : 'Not added'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <Text style={{ color: email ? theme.text : theme.textTertiary }} numberOfLines={1}>{email || 'Not added'}</Text>
        </View>
      </View>

      {both ? (
        <View style={[styles.done, { backgroundColor: theme.incomeSoft }]}>
          <Check color={theme.income} size={18} />
          <Text style={{ color: theme.income, flex: 1, fontSize: 14, fontWeight: '600' }}>Both are linked. Either one signs you in to this same account.</Text>
        </View>
      ) : phone && phone !== 'guest' ? (
        <View style={{ marginTop: 24, gap: 10 }}>
          <Text style={[styles.title, { color: theme.textSecondary, marginTop: 0 }]}>{emailOnly ? 'Add your WhatsApp number' : 'Add an email'}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
            {emailOnly
              ? 'We send a code on WhatsApp to prove the number is yours. Everything you have here moves to that number, so you can use the WhatsApp bot too.'
              : 'We email a code to prove the address is yours. After that you can sign in with the email or the WhatsApp number, and reach the same data.'}
          </Text>
          {step === 'enter' ? (
            <>
              <TextInput
                accessibilityLabel={emailOnly ? 'WhatsApp number' : 'Email address'}
                value={value}
                onChangeText={t => { setValue(t); setNote(null); }}
                placeholder={emailOnly ? 'e.g. 9876543210' : 'you@example.com'}
                placeholderTextColor={theme.textSecondary}
                keyboardType={emailOnly ? 'phone-pad' : 'email-address'}
                autoCapitalize="none"
                autoCorrect={false}
                style={input}
              />
              <Button theme={theme} label="Send code" busy={busy} disabled={!value.trim()} onPress={() => void send()} />
            </>
          ) : (
            <>
              <TextInput
                accessibilityLabel="Code"
                value={code}
                onChangeText={t => { const d = t.replace(/\D/g, '').slice(0, 6); setCode(d); setNote(null); if (d.length === 6) void confirm(d); }}
                placeholder="••••••"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                textAlign="center"
                autoFocus
                style={[input, { fontSize: 22, letterSpacing: 6 }]}
              />
              <Button theme={theme} label="Link" busy={busy} disabled={code.length !== 6} onPress={() => void confirm()} />
              <Pressable onPress={() => { setStep('enter'); setNote(null); }} style={{ alignSelf: 'center', padding: 6 }}>
                <Text style={{ color: theme.accent, fontWeight: '600' }}>{emailOnly ? 'Change number' : 'Change email'}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <Text style={{ color: theme.textSecondary, marginTop: 24 }}>Sign in first to link a number and an email.</Text>
      )}
      {note ? <Text accessibilityLiveRegion="polite" style={{ color: note.ok ? theme.income : theme.expense, marginTop: 12, fontSize: 14 }}>{note.text}</Text> : null}
    </ScrollView>
  );
}

function Button({ theme, label, busy, disabled, onPress }: { theme: ReturnType<typeof useTheme>; label: string; busy: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress}
      style={[styles.button, { backgroundColor: disabled ? theme.backgroundMuted : theme.accentFill, opacity: busy ? 0.8 : 1 }]}>
      {busy ? <ActivityIndicator color={theme.onAccent} /> : <Text style={{ color: disabled ? theme.textTertiary : theme.onAccent, fontWeight: '700', fontSize: 16 }}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 16, marginBottom: 7, marginTop: 4 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 50, paddingHorizontal: 14, paddingVertical: 10 },
  label: { fontSize: 16, fontWeight: '500' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  button: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14, marginTop: 24 },
});
