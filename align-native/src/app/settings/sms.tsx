import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Check, Copy, KeyRound, MessageSquareText } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { db } from '@/lib/firebase';
import { getItem, removeItem, setItem } from '@/lib/storage';
import { triggerHaptic } from '@/lib/haptics';
import { Radius } from '@/constants/theme';

const TOKEN_KEY = 'align_sms_ingest_token';
const SAMPLE_SMS = 'Sent Rs.250.00 From HDFC Bank A/C *1234 To ZOMATO On 01/10/26 Ref 427512345678';

function apiBase() {
  if (Platform.OS === 'web') return typeof window !== 'undefined' ? window.location.origin : '';
  return process.env.EXPO_PUBLIC_API_URL || '';
}

async function sha256(s: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
}

type Theme = ReturnType<typeof useTheme>;

function CopyField({ c, label, value }: { c: Theme; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        triggerHaptic('success');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={({ pressed }) => [styles.copyField, { backgroundColor: c.backgroundMuted, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.copyLabel, { color: c.textSecondary }]}>{label}</Text>
        <Text style={[styles.copyValue, { color: c.text }]} numberOfLines={1} selectable>{value}</Text>
      </View>
      {copied ? <Check color={c.income} size={18} /> : <Copy color={c.accent} size={18} />}
    </Pressable>
  );
}

function Step({ c, n, title, children }: { c: Theme; n: number; title: string; children?: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: c.accentSoft }]}>
        <Text style={{ color: c.accent, fontWeight: '800', fontSize: 13 }}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[styles.stepTitle, { color: c.text }]}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export default function SmsImportScreen() {
  const c = useTheme();
  const { phone } = usePhone();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const endpoint = `${apiBase()}/api/ingest/sms`;

  useEffect(() => {
    getItem(TOKEN_KEY).then(setToken);
  }, []);

  const createKey = async () => {
    if (!phone) return;
    setBusy(true);
    try {
      if (token) await deleteDoc(doc(db, 'planner_settings', `ingest_${await sha256(token)}`)).catch(() => {});
      const bytes = await Crypto.getRandomBytesAsync(24);
      const next = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      await setDoc(doc(db, 'planner_settings', `ingest_${await sha256(next)}`), { phone, createdAt: serverTimestamp() });
      await setItem(TOKEN_KEY, next);
      setToken(next);
      setTestResult(null);
      triggerHaptic('success');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'planner_settings', `ingest_${await sha256(token)}`)).catch(() => {});
      await removeItem(TOKEN_KEY);
      setToken(null);
      setTestResult(null);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, text: SAMPLE_SMS, dryRun: true }),
      });
      const data = await res.json().catch(() => ({}));
      setTestResult({ ok: res.ok && data.status === 'test', text: data.message || `Error ${res.status}` });
    } catch (e: any) {
      setTestResult({ ok: false, text: e?.message || 'Could not reach Align' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.hero, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: '#25A244' }]}>
          <MessageSquareText color="#fff" size={22} />
        </View>
        <Text style={[styles.heroTitle, { color: c.text }]}>Add expenses from bank SMS</Text>
        <Text style={[styles.body, { color: c.textSecondary, textAlign: 'center' }]}>
          iPhone doesn&apos;t let apps read your messages, so an iOS Shortcut sends each bank alert to Align. Align records debits and
          credits, ignores OTPs, reminders and offers, and never records the same payment twice.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <Step c={c} n={1} title="Create your private key">
          <Text style={[styles.body, { color: c.textSecondary }]}>Only messages sent with this key are added to your account.</Text>
          {token ? (
            <>
              <CopyField c={c} label="URL" value={endpoint} />
              <CopyField c={c} label="Key" value={token} />
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={busy || !phone}
              onPress={createKey}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: c.accentFill, opacity: pressed || busy ? 0.7 : 1 }]}
            >
              {busy ? <ActivityIndicator color={c.onAccent} /> : <KeyRound color={c.onAccent} size={18} />}
              <Text style={[styles.primaryText, { color: c.onAccent }]}>Create key</Text>
            </Pressable>
          )}
        </Step>

        <Step c={c} n={2} title="Make the automation in Shortcuts">
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Shortcuts app → <Text style={styles.b}>Automation</Text> → <Text style={styles.b}>+</Text> → <Text style={styles.b}>Message</Text>.{'\n'}
            Set <Text style={styles.b}>Message Contains</Text> to <Text style={styles.b}>Rs</Text>, choose <Text style={styles.b}>Run Immediately</Text>, then Next.
          </Text>
        </Step>

        <Step c={c} n={3} title="Add the “Get Contents of URL” action">
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Paste the <Text style={styles.b}>URL</Text>. Tap the arrow to expand: <Text style={styles.b}>Method</Text> POST,{' '}
            <Text style={styles.b}>Request Body</Text> JSON, and add two Text fields:{'\n'}
            • <Text style={styles.b}>token</Text> = your key{'\n'}
            • <Text style={styles.b}>text</Text> = Shortcut Input → tap it → <Text style={styles.b}>Content</Text>
          </Text>
        </Step>

        <Step c={c} n={4} title="Repeat for “INR”">
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Some banks write INR instead of Rs (e.g. ICICI). Duplicate the automation and change the word to <Text style={styles.b}>INR</Text>.
            Optional: add <Text style={styles.b}>Show Notification</Text> with the URL result to see what was added.
          </Text>
        </Step>
      </View>

      {token && (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={test}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: c.border, backgroundColor: c.backgroundElement, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: c.accent }]}>Test connection</Text>
          </Pressable>
          {testResult && (
            <Text style={[styles.body, { color: testResult.ok ? c.income : c.expense, textAlign: 'center', marginTop: 8 }]}>{testResult.text}</Text>
          )}
          <View style={styles.footerRow}>
            <Pressable accessibilityRole="button" onPress={createKey} disabled={busy}>
              <Text style={[styles.link, { color: c.textSecondary }]}>Replace key</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={turnOff} disabled={busy}>
              <Text style={[styles.link, { color: c.expense }]}>Turn off</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 48, gap: 16 },
  hero: { alignItems: 'center', gap: 10, padding: 20, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  heroIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20 },
  b: { fontWeight: '700' },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 20 },
  step: { flexDirection: 'row', gap: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 16, fontWeight: '700' },
  copyField: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md },
  copyLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  copyValue: { fontSize: 14, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), marginTop: 2 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: Radius.md, marginTop: 4 },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  secondaryText: { fontSize: 16, fontWeight: '600' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  link: { fontSize: 14, fontWeight: '600' },
});
