import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, MessageSquareText, Zap } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { triggerHaptic } from '@/lib/haptics';
import { Radius } from '@/constants/theme';
import {
  canAutoReadSms,
  createSmsToken,
  enableAndroidAutoImport,
  getSmsToken,
  isAutoReadOn,
  revokeSmsToken,
  smsEndpoint,
  smsPersonalLink,
} from '@/lib/sms-import';

const SAMPLE_SMS = 'Sent Rs.250.00 From HDFC Bank A/C *1234 To ZOMATO On 01/10/26 Ref 427512345678';
/** iCloud link to the shared "Align SMS" shortcut (optional; manual steps are shown without it). */
const SHORTCUT_URL = process.env.EXPO_PUBLIC_SMS_SHORTCUT_URL || '';

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

function PrimaryButton({ c, label, icon, onPress, busy }: { c: Theme; label: string; icon?: ReactNode; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryBtn, { backgroundColor: c.accentFill, opacity: pressed || busy ? 0.7 : 1 }]}
    >
      {busy ? <ActivityIndicator color={c.onAccent} /> : icon}
      <Text style={[styles.primaryText, { color: c.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

export default function SmsImportScreen() {
  const c = useTheme();
  const { phone } = usePhone();
  const [token, setToken] = useState<string | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getSmsToken().then(setToken);
    setAutoOn(isAutoReadOn());
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (e: any) {
      setNote({ ok: false, text: e?.message || 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  // Android APK: one tap does everything
  const turnOnAndroid = () =>
    run(async () => {
      if (!phone) return;
      const res = await enableAndroidAutoImport(phone);
      if (!res.ok) {
        setNote({ ok: false, text: res.reason === 'permission' ? 'Align needs SMS permission to read bank messages.' : 'Not available in this build.' });
        return;
      }
      setToken(await getSmsToken());
      setAutoOn(true);
      triggerHaptic('success');
      setNote({
        ok: true,
        text: res.imported
          ? `Imported ${res.imported} transaction${res.imported === 1 ? '' : 's'} from the last 30 days. New bank SMS are added automatically.`
          : 'On. New bank SMS are added automatically.',
      });
    });

  // iPhone / web: copy the personal link for the Shortcut
  const copyLink = () =>
    run(async () => {
      if (!phone) return;
      const t = token || (await createSmsToken(phone));
      setToken(t);
      await Clipboard.setStringAsync(smsPersonalLink(t));
      triggerHaptic('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  const test = () =>
    run(async () => {
      if (!token) return;
      const res = await fetch(smsPersonalLink(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: SAMPLE_SMS, dryRun: true }),
      });
      const data = await res.json().catch(() => ({}));
      setNote({ ok: res.ok && data.status === 'test', text: data.message || `Error ${res.status}` });
    });

  const turnOff = () =>
    run(async () => {
      await revokeSmsToken();
      setToken(null);
      setAutoOn(false);
    });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.hero, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: c.accentFill }]}>
          <MessageSquareText color={c.onAccent} size={22} />
        </View>
        <Text style={[styles.heroTitle, { color: c.text }]}>Add expenses from bank SMS</Text>
        <Text style={[styles.body, { color: c.textSecondary, textAlign: 'center' }]}>
          Align records debits and credits from bank and UPI messages, ignores OTPs, reminders and offers, and never adds the same payment twice.
        </Text>
      </View>

      {canAutoReadSms ? (
        <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <Text style={[styles.stepTitle, { color: c.text }]}>{autoOn ? 'Automatic import is on' : 'One tap, fully automatic'}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {autoOn
              ? 'New bank SMS are added to Money as they arrive, even when Align is closed.'
              : 'Align reads new bank SMS on this phone in the background and also imports the last 30 days. Messages never leave your phone except bank transaction alerts.'}
          </Text>
          {autoOn ? (
            <Pressable accessibilityRole="button" onPress={turnOff} disabled={busy} style={{ alignSelf: 'flex-start' }}>
              <Text style={[styles.link, { color: c.expense }]}>Turn off</Text>
            </Pressable>
          ) : (
            <PrimaryButton c={c} label="Turn on automatic import" icon={<Zap color={c.onAccent} size={18} />} onPress={turnOnAndroid} busy={busy} />
          )}
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <Step c={c} n={1} title="Copy your Align link">
            <Text style={[styles.body, { color: c.textSecondary }]}>A private link with your key built in. Only messages sent to it are added to your account.</Text>
            <PrimaryButton
              c={c}
              label={copied ? 'Copied' : 'Copy my link'}
              icon={copied ? <Check color={c.onAccent} size={18} /> : <Copy color={c.onAccent} size={18} />}
              onPress={copyLink}
              busy={busy}
            />
          </Step>

          <Step c={c} n={2} title={SHORTCUT_URL ? 'Add the Align SMS shortcut' : 'Create the “Align SMS” shortcut'}>
            {SHORTCUT_URL ? (
              <>
                <Text style={[styles.body, { color: c.textSecondary }]}>Tap below, then paste your link when Shortcuts asks for it.</Text>
                <Pressable accessibilityRole="button" onPress={() => Linking.openURL(SHORTCUT_URL)}>
                  <Text style={[styles.link, { color: c.accent }]}>Get the shortcut →</Text>
                </Pressable>
              </>
            ) : (
              <Text style={[styles.body, { color: c.textSecondary }]}>
                Shortcuts → <Text style={styles.b}>+</Text> → name it <Text style={styles.b}>Align SMS</Text> → add <Text style={styles.b}>Get Contents of URL</Text>.
                Paste your link, set <Text style={styles.b}>Method</Text> POST, <Text style={styles.b}>Request Body</Text> JSON, and add one field{' '}
                <Text style={styles.b}>text</Text> = <Text style={styles.b}>Shortcut Input</Text>.
              </Text>
            )}
          </Step>

          <Step c={c} n={3} title="Run it for every bank SMS">
            <Text style={[styles.body, { color: c.textSecondary }]}>
              Shortcuts → <Text style={styles.b}>Automation</Text> → <Text style={styles.b}>+</Text> → <Text style={styles.b}>Message</Text> → Message Contains{' '}
              <Text style={styles.b}>Rs</Text> → <Text style={styles.b}>Run Immediately</Text> → Run Shortcut <Text style={styles.b}>Align SMS</Text>. Repeat once with{' '}
              <Text style={styles.b}>INR</Text>.
            </Text>
          </Step>

          {Platform.OS === 'android' && (
            <Text style={[styles.body, { color: c.textSecondary }]}>
              On Android, install the Align app (APK) for one-tap automatic import instead.
            </Text>
          )}
        </View>
      )}

      {token && !canAutoReadSms && (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={test}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: c.border, backgroundColor: c.backgroundElement, opacity: pressed || busy ? 0.7 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: c.accent }]}>Test connection</Text>
          </Pressable>
          <View style={styles.footerRow}>
            <Pressable accessibilityRole="button" onPress={() => run(async () => { if (phone) { setToken(await createSmsToken(phone)); setNote({ ok: true, text: 'New link created. Copy it into your shortcut.' }); } })} disabled={busy}>
              <Text style={[styles.link, { color: c.textSecondary }]}>Replace link</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={turnOff} disabled={busy}>
              <Text style={[styles.link, { color: c.expense }]}>Turn off</Text>
            </Pressable>
          </View>
        </>
      )}

      {note && <Text style={[styles.body, { color: note.ok ? c.income : c.expense, textAlign: 'center' }]}>{note.text}</Text>}
      {!token && !canAutoReadSms && <Text style={[styles.hint, { color: c.textTertiary }]}>{smsEndpoint()}</Text>}
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
  hint: { fontSize: 12, textAlign: 'center' },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 18 },
  step: { flexDirection: 'row', gap: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 16, fontWeight: '700' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: Radius.md, marginTop: 4 },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  secondaryText: { fontSize: 16, fontWeight: '600' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  link: { fontSize: 15, fontWeight: '600' },
});
