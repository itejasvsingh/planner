import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { finishGoogleRedirect, signInWithGoogle } from '@/lib/google-auth';
import { normalizePhone } from '@/lib/phone';

const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';
const CODE_LEN = 6;
const RESEND_SECONDS = 30;

const masked = (p: string) => {
  const d = normalizePhone(p);
  return d.length > 10 ? `+${d.slice(0, d.length - 10)} ••••• ${d.slice(-5)}` : `••••• ${d.slice(-5)}`;
};

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { phone, firebaseUser, needsPhoneSetup, lastPhone, sendCode, verifyCode, logout } = usePhone();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viaTemplate, setViaTemplate] = useState(true);
  const [wait, setWait] = useState(0);
  const [botNumber, setBotNumber] = useState<string | null>(null);

  useEffect(() => {
    if (phone && !needsPhoneSetup) router.replace('/(tabs)');
  }, [phone, needsPhoneSetup, router]);

  useEffect(() => {
    if (lastPhone && !phoneInput) setPhoneInput(lastPhone);
    // Prefill once when the saved number loads; don't overwrite what the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPhone]);

  // Align's WhatsApp number, for the "Get code on WhatsApp" button.
  useEffect(() => {
    if (step !== 'code' || botNumber) return;
    fetch(`${API_BASE}/api/auth/bot`)
      .then((r) => r.json())
      .then((d) => d?.number && setBotNumber(String(d.number)))
      .catch(() => {});
  }, [step, botNumber]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function requestCode() {
    if (!phoneInput.trim()) {
      setError('Enter your WhatsApp number.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await sendCode(phoneInput.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setViaTemplate(res.template);
    setCode('');
    setStep('code');
    setWait(RESEND_SECONDS);
  }

  async function submitCode(value = code) {
    if (value.length !== CODE_LEN) {
      setError('Enter the 6-digit code from WhatsApp.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await verifyCode(phoneInput.trim(), value);
    setBusy(false);
    if (!res.ok) setError(res.message);
  }

  // Back from Google (home-screen web app): finish signing in
  const { google } = useLocalSearchParams<{ google?: string }>();
  useEffect(() => {
    if (!google || Platform.OS !== 'web') return;
    setBusy(true);
    void finishGoogleRedirect(String(google)).then(msg => {
      if (msg) setError(msg);
      setBusy(false);
      if (typeof window !== 'undefined') window.history.replaceState(null, '', '/login');
    });
  }, [google]);

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      // Firebase's own messages are codes ("auth/unauthorized-domain"); say what to do instead
      const plain: Record<string, string> = {
        'auth/unauthorized-domain': 'Google sign-in isn’t switched on for this web address yet. Use “Send code on WhatsApp” for now.',
        'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
        'auth/operation-not-supported-in-this-environment': 'Google sign-in doesn’t work in the installed web app. Open the site in your browser, or use WhatsApp.',
        'auth/network-request-failed': 'No connection. Check your internet and try again.',
        'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
      };
      setError(plain[code] || 'Could not sign in with Google. Try again, or use “Send code on WhatsApp”.');
    } finally {
      setBusy(false);
    }
  }

  // Signed in with Google, number not verified yet: same code flow, then it is linked to the account.
  const linking = Boolean(firebaseUser && needsPhoneSetup);
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? insets.top + 8 : Math.max(insets.top, 52);
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }];

  return (
    <View style={[styles.safe, { backgroundColor: theme.background, paddingTop: topPadding }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{linking ? 'One last step' : 'Welcome back!'}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {linking
              ? 'Verify your WhatsApp number to continue.'
              : step === 'code' ? `Enter the code sent on WhatsApp to ${masked(phoneInput)}.` : 'Login to continue'}
          </Text>
        </View>

        {step === 'phone' ? (
          <View style={styles.formContainer}>
            {linking && firebaseUser?.email ? (
              <Text style={[styles.accountBadge, { color: theme.textSecondary }]}>Signed in as {firebaseUser.email}</Text>
            ) : null}
            
            <Text style={[styles.inputLabel, { color: theme.text }]}>WhatsApp Number</Text>
            <TextInput
              accessibilityLabel="WhatsApp number"
              value={phoneInput}
              onChangeText={(t) => {
                setPhoneInput(t);
                if (error) setError(null);
              }}
              placeholder="e.g. 9876543210"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              autoComplete="tel"
              autoFocus
              style={inputStyle}
            />
            {error ? <Text style={[styles.error, { color: theme.red }]}>{error}</Text> : null}
            
            <View style={{ marginTop: 24 }}>
              <PrimaryButton theme={theme} label="Login" busy={busy} onPress={() => void requestCode()} />
            </View>

            {linking ? (
              <Pressable onPress={() => void logout()} style={styles.switchAccountBtn}>
                <Text style={[styles.switchAccountText, { color: theme.blue }]}>Use a different account</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                  <Text style={[styles.dividerText, { color: theme.textSecondary }]}>Or continue with</Text>
                  <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign in with Google"
                  onPress={() => void handleGoogleSignIn()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.googleButton,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed || busy ? 0.8 : 1 },
                  ]}
                >
                  <View style={styles.googleButtonContent}>
                    <Text style={styles.googleIconText}>G</Text>
                    <Text style={[styles.googleButtonText, { color: theme.text }]}>Google</Text>
                  </View>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={styles.formContainer}>
            <Text style={[styles.inputLabel, { color: theme.text }]}>6-Digit Code</Text>
            <TextInput
              accessibilityLabel="Login code"
              value={code}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, '').slice(0, CODE_LEN);
                setCode(digits);
                if (error) setError(null);
                if (digits.length === CODE_LEN) void submitCode(digits);
              }}
              placeholder="••••••"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={CODE_LEN}
              autoFocus
              textAlign="center"
              style={[inputStyle, styles.codeInput]}
            />
            {error ? <Text style={[styles.error, { color: theme.red }]}>{error}</Text> : null}
            <PrimaryButton theme={theme} label="Verify" busy={busy} onPress={() => void submitCode()} />
            {botNumber ? (
              <>
                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  {viaTemplate ? 'Not getting it?' : 'No code yet?'} Send &quot;Login&quot; to Align on WhatsApp and it replies with your code.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Get code on WhatsApp"
                  onPress={() => void Linking.openURL(`https://wa.me/${botNumber}?text=Login`)}
                  style={({ pressed }) => [styles.waButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={[styles.googleButtonText, { color: theme.text }]}>Get code on WhatsApp</Text>
                </Pressable>
              </>
            ) : !viaTemplate ? (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                Not getting it? Send &quot;Login&quot; to Align on WhatsApp and it replies with your code.
              </Text>
            ) : null}
            <View style={styles.codeLinks}>
              <Pressable disabled={wait > 0 || busy} onPress={() => void requestCode()} style={styles.switchAccountBtn}>
                <Text style={[styles.switchAccountText, { color: wait > 0 ? theme.textSecondary : theme.blue }]}>
                  {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
                </Text>
              </Pressable>
              <Pressable onPress={() => { setStep('phone'); setError(null); }} style={styles.switchAccountBtn}>
                <Text style={[styles.switchAccountText, { color: theme.blue }]}>Change number</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function PrimaryButton({ theme, label, busy, onPress }: { theme: ReturnType<typeof useTheme>; label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.button, { backgroundColor: theme.accentFill, opacity: pressed || busy ? 0.8 : 1 }]}
    >
      {busy ? <ActivityIndicator color={theme.onAccent} /> : <Text style={[styles.buttonText, { color: theme.onAccent }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingTop: 40,
  },
  header: {
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    marginBottom: 40,
  },
  formContainer: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
  },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'left',
    maxWidth: 300,
  },
  accountBadge: {
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: 340,
    fontSize: 18,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  button: {
    width: '100%',
    maxWidth: 340,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '800' },
  googleButton: {
    width: '100%',
    maxWidth: 340,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleIconText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  error: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 12, maxWidth: 340 },
  switchAccountBtn: {
    marginTop: 20,
    padding: 8,
  },
  switchAccountText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    opacity: 0.6,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  codeInput: { fontSize: 26, letterSpacing: 10, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 320, marginTop: 14 },
  codeLinks: { flexDirection: 'row', gap: 24, marginTop: 4 },
  waButton: { width: '100%', maxWidth: 340, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginTop: 12 },
});
