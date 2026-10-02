import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '@/components/ui/pressable';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

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
  
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? insets.top + 8 : Math.max(insets.top, 52);

  return (
    <View style={[styles.safe, { backgroundColor: theme.background, paddingTop: topPadding }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <View style={[styles.logo, { backgroundColor: theme.accentFill }]}>
          <Check size={36} color={theme.onAccent} strokeWidth={3.5} />
        </View>

        {!showPhoneStep ? (
          <>
            <Text style={[styles.title, { color: theme.text }]}>align.</Text>
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
                { backgroundColor: theme.accentFill, opacity: pressed || busy ? 0.8 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <Text style={[styles.buttonText, { color: theme.onAccent }]}>Continue</Text>
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

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue without sign-in"
              onPress={async () => {
                await login('guest');
                router.replace('/(tabs)');
              }}
              style={styles.guestButton}
            >
              <Text style={[styles.guestButtonText, { color: theme.textSecondary }]}>
                Continue without sign-in →
              </Text>
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
                { backgroundColor: theme.accentFill, opacity: pressed || busy ? 0.8 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <Text style={[styles.buttonText, { color: theme.onAccent }]}>Complete Setup</Text>
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
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 36, fontWeight: '800', letterSpacing: -1.2, marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
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
  guestButton: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
