import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRouter } from "expo-router";
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { login } = usePhone();
  const [loginInput, setLoginInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setBusy(true);
    setError(null);
    const result = await login(loginInput);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      Alert.alert('Align', result.message);
    } else {
      router.replace('/(tabs)');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <View style={styles.logo}>
          <Text style={styles.logoMark}>⚡</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Align</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Enter your WhatsApp number to sync your personalized timeline and finances.
        </Text>
        <TextInput
          value={loginInput}
          onChangeText={setLoginInput}
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
          onPress={handleContinue}
          disabled={busy}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.blue, opacity: pressed || busy ? 0.8 : 1 },
          ]}>
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  },
  logoMark: { fontSize: 36, color: '#fff' },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 32,
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
  error: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 12, maxWidth: 340 },
});
