import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Check, Mail, RefreshCw } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { triggerHaptic } from '@/lib/haptics';
import { connectGmail, gmailBanks, gmailDisconnect, gmailStatus, gmailSyncNow, type GmailStatus } from '@/lib/gmail-connect';
import BankPicker from '@/components/BankPicker';
import CardBills from '@/components/CardBills';

type Theme = ReturnType<typeof useTheme>;
const PRIVACY_URL = 'https://alignplanner.vercel.app/privacy';

const OUTCOME: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Gmail connected. Checking your bank emails from the last 90 days…' },
  missing_scope: { ok: false, text: 'Gmail access wasn’t allowed. Connect again and leave “View your email messages and settings” ticked.' },
  expired: { ok: false, text: 'That took too long. Tap Connect Gmail to try again.' },
  failed: { ok: false, text: 'Couldn’t connect Gmail. Try again.' },
  cancelled: { ok: false, text: 'Gmail wasn’t connected.' },
};

function ago(ms: number | null) {
  if (!ms) return 'not yet';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function Point({ c, children }: { c: Theme; children: ReactNode }) {
  return (
    <View style={styles.point}>
      <Check color={c.income} size={16} strokeWidth={2.6} style={{ marginTop: 2 }} />
      <Text style={[styles.body, { color: c.textSecondary, flex: 1 }]}>{children}</Text>
    </View>
  );
}

function Button({ c, label, onPress, busy, primary, danger, icon }: { c: Theme; label: string; onPress: () => void; busy?: boolean; primary?: boolean; danger?: boolean; icon?: ReactNode }) {
  const color = primary ? c.onAccent : danger ? c.expense : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: primary ? c.accentFill : c.backgroundMuted, opacity: pressed || busy ? 0.7 : 1 }]}
    >
      {busy ? <ActivityIndicator color={color} /> : icon}
      <Text style={[styles.btnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Connect Gmail (read-only) so bank alert emails become transactions automatically. The server checks every
 * 15 minutes and when the app opens; see lib/gmail.ts on the server.
 */
export default function GmailScreen() {
  const c = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ gmail?: string }>();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  // Bank picker: opens with detection right after connecting, or from "Change"
  const [picking, setPicking] = useState<null | 'after-connect' | 'change'>(null);
  const [bankSummary, setBankSummary] = useState<string | null>(null);
  const [billsKey, setBillsKey] = useState(0);

  const loadBanks = useCallback(async () => {
    try {
      const d = await gmailBanks();
      const names = d.banks.filter((b) => d.selected?.includes(b.id)).map((b) => b.name);
      const all = [...names, ...d.extra];
      setBankSummary(d.selected === null ? 'All banks (not chosen yet)' : all.length ? all.join(', ') : 'None chosen');
    } catch { /* shown when the picker opens */ }
  }, []);

  const load = useCallback(async () => {
    try {
      setStatus(await gmailStatus());
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    }
  }, []);

  const syncNow = useCallback(async (quiet = false) => {
    setBusy('sync');
    try {
      const r = await gmailSyncNow();
      if (!quiet || r.added || r.message || r.status !== 'ok') {
        const addedText = r.added ? `Added ${r.added} new transaction${r.added === 1 ? '' : 's'} from Gmail.` : '';
        setNote({
          ok: r.status === 'ok',
          text: r.status === 'ok' ? [addedText, r.message].filter(Boolean).join(' ') || 'Checked. Nothing new.' : r.message || 'Couldn’t check Gmail just now.',
        });
      }
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
      setBillsKey((k) => k + 1);
      void load();
    }
  }, [load]);

  const afterConnect = useCallback((outcome: string) => {
    if (outcome === 'connected') {
      triggerHaptic('success');
      setNote({ ok: true, text: 'Gmail connected. Choose the banks and cards to read; Align has looked for the ones that email you.' });
      setPicking('after-connect');
      void load();
    } else {
      setNote(OUTCOME[outcome] || OUTCOME.failed);
      void load();
    }
  }, [load]);

  const banksSaved = useCallback((rereading: boolean) => {
    const first = picking === 'after-connect';
    setPicking(null);
    void loadBanks();
    if (first || rereading) {
      setNote({ ok: true, text: first ? 'Saved. Reading your bank emails from the last 90 days, newest first…' : 'Saved. Reading the new bank’s emails from the last 90 days…' });
      void syncNow(true);
    } else {
      setNote({ ok: true, text: 'Saved.' });
    }
  }, [picking, loadBanks, syncNow]);

  useEffect(() => {
    if (status?.connected) void loadBanks();
  }, [status?.connected, loadBanks]);

  useEffect(() => {
    void load();
  }, [load]);

  // Back from Google on the web: /settings/gmail?gmail=connected
  useEffect(() => {
    if (!params.gmail) return;
    afterConnect(String(params.gmail));
    router.setParams({ gmail: undefined });
  }, [params.gmail, afterConnect, router]);

  const connect = async () => {
    setBusy('connect');
    setNote(null);
    try {
      const outcome = await connectGmail();
      if (outcome) afterConnect(outcome);
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    try {
      await gmailDisconnect();
      setConfirmOff(false);
      setNote({ ok: true, text: 'Gmail disconnected. Transactions already added stay in Money.' });
      await load();
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const connected = status?.connected ? status : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.hero, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: c.accentFill }]}>
          <Mail color={c.onAccent} size={22} />
        </View>
        <Text style={[styles.heroTitle, { color: c.text }]}>{connected ? 'Gmail is connected' : 'Connect Gmail'}</Text>
        <Text style={[styles.body, { color: c.textSecondary, textAlign: 'center' }]}>
          Align reads your bank and card alert emails and adds the transactions for you, checking every 15 minutes and whenever you open the app.
        </Text>
      </View>

      {note ? (
        <View style={[styles.note, { backgroundColor: note.ok ? c.incomeSoft : c.warningSoft }]}>
          <Text style={{ color: note.ok ? c.income : c.warning, fontSize: 14, fontWeight: '600' }}>{note.text}</Text>
        </View>
      ) : null}

      {status === null ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
      ) : connected ? (
        <>
        <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          {connected.status === 'reconnect' ? (
            <View style={styles.point}>
              <AlertTriangle color={c.warning} size={18} />
              <Text style={[styles.body, { color: c.warning, flex: 1 }]}>{connected.lastError || 'Gmail access was removed. Connect again to keep importing.'}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Account</Text>
            <Text style={[styles.value, { color: c.text }]} numberOfLines={1}>{connected.email || 'Gmail'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Last checked</Text>
            <Text style={[styles.value, { color: c.text }]}>{ago(connected.lastSyncAt)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Added from Gmail</Text>
            <Text style={[styles.value, { color: c.text }]}>{connected.added} transaction{connected.added === 1 ? '' : 's'}</Text>
          </View>
          {picking ? (
            <View style={[styles.pickerBox, { borderColor: c.border }]}>
              <BankPicker autoDetect={picking === 'after-connect'} onSaved={banksSaved} />
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={[styles.label, { color: c.textSecondary }]}>Banks and cards</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Change banks and cards" onPress={() => setPicking('change')} style={{ flexShrink: 1 }}>
                <Text style={[styles.value, { color: c.accent }]} numberOfLines={2}>{bankSummary ?? '…'} · Change</Text>
              </Pressable>
            </View>
          )}
          {connected.lastError && connected.status === 'connected' ? (
            <Text style={{ color: c.textTertiary, fontSize: 13 }}>{connected.lastError}</Text>
          ) : null}
          {connected.status === 'reconnect' ? (
            <Button c={c} primary label="Connect Gmail again" busy={busy === 'connect'} onPress={() => void connect()} icon={<Mail color={c.onAccent} size={18} />} />
          ) : (
            <Button c={c} label="Check now" busy={busy === 'sync'} onPress={() => void syncNow()} icon={<RefreshCw color={c.accent} size={17} />} />
          )}
          {confirmOff ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.body, { color: c.textSecondary }]}>Stop reading Gmail? Align removes its access at Google. Transactions already added stay.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button c={c} danger label="Disconnect" busy={busy === 'disconnect'} onPress={() => void disconnect()} /></View>
                <View style={{ flex: 1 }}><Button c={c} label="Keep" onPress={() => setConfirmOff(false)} /></View>
              </View>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setConfirmOff(true)} style={styles.link}>
              <Text style={{ color: c.expense, fontWeight: '600', fontSize: 15 }}>Disconnect Gmail</Text>
            </Pressable>
          )}
        </View>
        {connected.status === 'connected' && !picking ? <CardBills refreshKey={billsKey} /> : null}
        </>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>What Align does with your Gmail</Text>
            <Point c={c}>Only opens emails from banks and card companies, including slice.</Point>
            <Point c={c}>Read-only: it can’t send, delete or change anything.</Point>
            <Point c={c}>Keeps the transactions, not the emails. Nothing is sold, used for ads or sent to AI.</Point>
            <Point c={c}>You can disconnect any time, here or in your Google account.</Point>
          </View>
          <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>What Google will show</Text>
            <Text style={[styles.body, { color: c.textSecondary }]}>
              Google asks to let Align “view your email messages and settings”, because Gmail has no bank-only option. As Align is a personal app, Google first says it hasn’t verified it: tap <Text style={styles.b}>Advanced</Text>, then <Text style={styles.b}>Go to Align</Text>, and leave the Gmail box ticked.
            </Text>
            <Button c={c} primary label="Connect Gmail" busy={busy === 'connect'} onPress={() => void connect()} icon={<Mail color={c.onAccent} size={18} />} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings/email')} style={styles.link}>
            <Text style={{ color: c.accent, fontWeight: '600', fontSize: 15 }}>Rather not connect? Use a script in your own Gmail</Text>
          </Pressable>
        </>
      )}

      <Pressable accessibilityRole="link" onPress={() => void (Platform.OS === 'web' ? Linking.openURL('/privacy') : Linking.openURL(PRIVACY_URL))} style={styles.link}>
        <Text style={{ color: c.textTertiary, fontSize: 13 }}>Privacy policy</Text>
      </Pressable>
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
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  note: { padding: 12, borderRadius: Radius.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { fontSize: 14 },
  value: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: Radius.md },
  btnText: { fontSize: 15, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: 10 },
  pickerBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
});
