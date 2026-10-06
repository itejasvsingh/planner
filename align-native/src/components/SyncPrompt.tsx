import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, View } from 'react-native';
import { Check, Mail, MessageSquareText, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { whenSignedIn } from '@/lib/firebase';
import { getItem, setItem } from '@/lib/storage';
import { connectGmail, gmailStatus } from '@/lib/gmail-connect';
import { canAutoReadSms, enableAndroidAutoImport, isAutoReadOn } from '@/lib/sms-import';

const SNOOZE_MS = 7 * 86400000;

/**
 * After sign-in: "Track expenses automatically": connect Gmail (bank alerts and statements) and, in the
 * Android app, read bank SMS. Shown while either is off; "Not now" waits a week; gone once both are on.
 */
export default function SyncPrompt() {
  const c = useTheme();
  const { phone } = usePhone();
  const [open, setOpen] = useState(false);
  const [gmailOn, setGmailOn] = useState(false);
  const [smsOn, setSmsOn] = useState(false);
  const [busy, setBusy] = useState<'gmail' | 'sms' | null>(null);
  const [note, setNote] = useState('');
  const key = `align_sync_prompt_${phone}`;

  useEffect(() => {
    if (!phone) return;
    let live = true;
    const stop = whenSignedIn(() => {
      void (async () => {
        const snoozed = Number((await getItem(key)) || 0);
        if (Date.now() < snoozed) return;
        const sms = canAutoReadSms ? isAutoReadOn() : true;
        const status = await gmailStatus().catch(() => null);
        if (!status || !live) return; // offline: ask another time
        const gmail = status.connected;
        setGmailOn(gmail);
        setSmsOn(sms);
        if (!gmail || !sms) setOpen(true);
      })();
    });
    return () => { live = false; stop(); };
  }, [phone, key]);

  const close = (snooze: boolean) => {
    setOpen(false);
    if (snooze) void setItem(key, String(Date.now() + SNOOZE_MS));
  };

  const onGmail = async () => {
    setBusy('gmail');
    setNote('');
    try {
      // On the web the page goes to Google and returns to Settings → Gmail
      const result = await connectGmail();
      if (result === 'connected') setGmailOn(true);
      else if (result && result !== 'cancelled') setNote('Gmail didn’t connect. Try again from Settings → Gmail.');
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onSms = async () => {
    if (!phone) return;
    setBusy('sms');
    setNote('');
    try {
      const res = await enableAndroidAutoImport(phone);
      if (res.ok) {
        setSmsOn(true);
        setNote(res.imported ? `Added ${res.imported} transaction${res.imported === 1 ? '' : 's'} from your last 30 days of bank SMS.` : '');
      } else setNote(res.reason === 'permission' ? 'Align needs SMS permission to read bank messages. You can allow it later in Settings → SMS.' : 'SMS reading isn’t available here.');
    } finally {
      setBusy(null);
    }
  };

  const row = (Icon: typeof Mail, title: string, detail: string, on: boolean, action: () => void, which: 'gmail' | 'sms') => (
    <View style={[styles.row, { borderColor: c.border, backgroundColor: c.backgroundElement }]}>
      <View style={[styles.icon, { backgroundColor: on ? c.incomeSoft : c.accentSoft }]}>
        {on ? <Check color={c.income} size={18} /> : <Icon color={c.accent} size={18} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>{detail}</Text>
      </View>
      {on ? (
        <Text style={{ color: c.income, fontWeight: '700', fontSize: 13 }}>On</Text>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={!!busy} onPress={action} style={[styles.btn, { backgroundColor: c.accentFill }]}>
          {busy === which ? <ActivityIndicator color={c.onAccent} size="small" /> : <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 13 }}>Turn on</Text>}
        </Pressable>
      )}
    </View>
  );

  const allOn = gmailOn && smsOn;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => close(true)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: c.background }]}>
          <View style={[styles.badge, { backgroundColor: c.accentFill }]}><Sparkles color={c.onAccent} size={22} /></View>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Track expenses automatically</Text>
          <Text style={{ color: c.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
            Align can add your spending by itself, sorted into categories, with card bills and balances, so you don’t type a thing.
          </Text>
          {row(Mail, 'Connect Gmail', 'Reads only your banks’ alert emails and statements. Read-only; never sent to AI.', gmailOn, () => void onGmail(), 'gmail')}
          {canAutoReadSms
            ? row(MessageSquareText, 'Read bank SMS', 'Adds a payment the moment your bank texts you, and the last 30 days now.', smsOn, () => void onSms(), 'sms')
            : Platform.OS !== 'android' && (
              <Text style={{ color: c.textTertiary, fontSize: 12, textAlign: 'center' }}>Bank SMS can be read automatically in the Align Android app.</Text>
            )}
          {!!note && <Text accessibilityLiveRegion="polite" style={{ color: c.textSecondary, fontSize: 13, textAlign: 'center' }}>{note}</Text>}
          <Pressable accessibilityRole="button" onPress={() => close(!allOn)} style={[styles.done, { backgroundColor: allOn ? c.accentFill : c.backgroundMuted }]}>
            <Text style={{ color: allOn ? c.onAccent : c.textSecondary, fontWeight: '700' }}>{allOn ? 'Done' : 'Not now'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: Radius.xl, padding: 20, gap: 12, width: '100%', maxWidth: 440, alignSelf: 'center' },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Radius.lg, padding: 12 },
  icon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.pill, minWidth: 74, alignItems: 'center' },
  done: { paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', marginTop: 4 },
});
