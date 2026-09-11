import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { signInWithGoogle, signOutGoogle } from '@/lib/google-auth';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { phone, firebaseUser, needsPhoneSetup, savePhone, login, logout } = usePhone();

  const [phoneInput, setPhoneInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If user has a phone set up, navigate directly to main tabs
    if (phone && !needsPhoneSetup) {
      router.replace('/(tabs)');
    }
  }, [phone, needsPhoneSetup, router]);

  async function handlePhoneLogin() {
    if (!phoneInput.trim()) {
      setError('Please enter your WhatsApp number.');
      return;
    }
    setBusy(true);
    setError(null);

    const result = await login(phoneInput.trim());
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      Alert.alert('Login Notice', result.message);
    } else {
      router.replace('/(tabs)');
    }
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const user = await signInWithGoogle();
      if (!user) {
        setBusy(false);
        return;
      }
    } catch (err: any) {
      console.error('Google sign-in error:', err);
      const msg = err.message || 'Failed to sign in with Google.';
      setError(msg);
      Alert.alert('Sign In Failed', msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleCompletePhoneSetup() {
    return handlePhoneLogin();
  }

  // Show one-time phone capture step if user has signed in with Google but has no linked phone
  const showPhoneStep = Boolean(firebaseUser && needsPhoneSetup);

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <View style={styles.logo}>
          <Text style={styles.logoMark}>⚡</Text>
        </View>

        {!showPhoneStep ? (
          <>
            <Text style={[styles.title, { color: theme.text }]}>Align</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Enter your WhatsApp number to sync your personalized timeline and finances.
            </Text>

            <TextInput
              value={phoneInput}
              onChangeText={(t) => {
                setPhoneInput(t);
                if (error) setError(null);
              }}
              placeholder="e.g. 919876543210"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              autoFocus
              textAlign="center"
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            />

            {error ? <Text style={[styles.error, { color: theme.red }]}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue"
              onPress={handlePhoneLogin}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.blue, opacity: pressed || busy ? 0.8 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
              onPress={handleGoogleSignIn}
              disabled={busy}
              style={({ pressed }) => [
                styles.googleButton,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  opacity: pressed || busy ? 0.8 : 1,
                },
              ]}
            >
              <View style={styles.googleButtonContent}>
                <Text style={styles.googleIconText}>G</Text>
                <Text style={[styles.googleButtonText, { color: theme.text }]}>
                  Sign in with Google
                </Text>
              </View>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: theme.text }]}>One Last Step</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Enter your WhatsApp number to sync your personalized timeline and finances.
            </Text>

            {firebaseUser?.email ? (
              <Text style={[styles.accountBadge, { color: theme.textSecondary }]}>
                Signed in as {firebaseUser.email}
              </Text>
            ) : null}

            <TextInput
              value={phoneInput}
              onChangeText={(t) => {
                setPhoneInput(t);
                if (error) setError(null);
              }}
              placeholder="e.g. 919876543210"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              autoFocus
              textAlign="center"
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            />

            {error ? <Text style={[styles.error, { color: theme.red }]}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Complete Setup"
              onPress={handleCompletePhoneSetup}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.blue, opacity: pressed || busy ? 0.8 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Complete Setup</Text>
              )}
            </Pressable>

            <Pressable
              onPress={async () => {
                await logout();
              }}
              style={styles.switchAccountBtn}
            >
              <Text style={[styles.switchAccountText, { color: theme.blue }]}>
                Use a different account
              </Text>
            </Pressable>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoMark: { fontSize: 36, color: '#fff' },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 32,
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
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  button: {
    width: '100%',
    maxWidth: 340,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  googleButton: {
    width: '100%',
    maxWidth: 340,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
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
    fontSize: 17,
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
});
