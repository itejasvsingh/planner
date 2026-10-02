import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, ExternalLink, Mail } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { triggerHaptic } from '@/lib/haptics';
import { Radius } from '@/constants/theme';
import { createSmsToken, getSmsToken, smsPersonalLink } from '@/lib/sms-import';
import { gmailScript } from '@/lib/gmail-script';

const NEW_SCRIPT_URL = 'https://script.google.com/home/projects/create';

type Theme = ReturnType<typeof useTheme>;

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

function Button({ c, label, icon, onPress, busy, primary }: { c: Theme; label: string; icon?: ReactNode; onPress: () => void; busy?: boolean; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        primary ? { backgroundColor: c.accentFill } : { backgroundColor: c.backgroundMuted },
        { opacity: pressed || busy ? 0.7 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? c.onAccent : c.accent} /> : icon}
      <Text style={[styles.btnText, { color: primary ? c.onAccent : c.accent }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Bank alert emails → Align, via a small Google Apps Script the user adds to their own Gmail. It uses the
 * same personal key as SMS auto-import, so a payment that arrives by SMS and email is recorded once.
 */
export default function EmailImportScreen() {
  const c = useTheme();
  const { phone } = usePhone();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const copyScript = async () => {
    if (!phone) return;
    setBusy(true);
    setError('');
    try {
      const token = (await getSmsToken()) || (await createSmsToken(phone));
      await Clipboard.setStringAsync(gmailScript(smsPersonalLink(token)));
      triggerHaptic('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not create your import key. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.hero, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: c.accentFill }]}>
          <Mail color={c.onAccent} size={22} />
        </View>
        <Text style={[styles.heroTitle, { color: c.text }]}>Add expenses from bank emails</Text>
        <Text style={[styles.body, { color: c.textSecondary, textAlign: 'center' }]}>
          Banks email you for every card spend and UPI payment. A small script in your Gmail sends those alerts to Align every 15 minutes, and adds the last 30 days the first time.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          Works with Gmail. Takes about two minutes and is easiest on a computer: open Align&apos;s website there, go to Settings → Email Auto-Import.
        </Text>
        <Step c={c} n={1} title="Copy your script">
          <Text style={[styles.body, { color: c.textSecondary }]}>It contains your personal import link, so keep it to yourself.</Text>
          <Button c={c} primary busy={busy} onPress={() => void copyScript()} label={copied ? 'Copied' : 'Copy script'}
            icon={copied ? <Check color={c.onAccent} size={18} /> : <Copy color={c.onAccent} size={18} />} />
          {!!error && <Text style={{ color: c.expense, fontSize: 13 }}>{error}</Text>}
        </Step>
        <Step c={c} n={2} title="Create a Google Apps Script">
          <Text style={[styles.body, { color: c.textSecondary }]}>Sign in with the Gmail that gets your bank emails. Delete the sample code, paste the script, and save (⌘S or Ctrl+S).</Text>
          <Button c={c} onPress={() => void Linking.openURL(NEW_SCRIPT_URL)} label="Open Apps Script" icon={<ExternalLink color={c.accent} size={17} />} />
        </Step>
        <Step c={c} n={3} title="Run setup once">
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Pick <Text style={styles.b}>setup</Text> in the function menu and press <Text style={styles.b}>Run</Text>. Google asks for access: choose your account, then <Text style={styles.b}>Advanced → Go to project</Text> (it&apos;s your own script) and <Text style={styles.b}>Allow</Text>.
          </Text>
        </Step>
        <Step c={c} n={4} title="That's it">
          <Text style={[styles.body, { color: c.textSecondary }]}>Bank alerts show up in Money within 15 minutes. Payments that also came by SMS aren&apos;t added twice.</Text>
        </Step>
      </View>

      <Text style={[styles.hint, { color: c.textTertiary }]}>
        The script runs in your Google account and only reads emails from bank addresses. If your bank is missing, add its email domain to the list at the top of the script. To stop, delete the project at script.google.com; turning off SMS Auto-Import also turns this off.
      </Text>
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
  hint: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 18 },
  step: { flexDirection: 'row', gap: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 16, fontWeight: '700' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, marginTop: 4 },
  btnText: { fontSize: 15, fontWeight: '700' },
});
