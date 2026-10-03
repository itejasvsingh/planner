import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { CreditCard } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { gmailBills, gmailSetBillReminders, type CardBill } from '@/lib/gmail-connect';

const inr = (n: number) => {
  const d = Number.isInteger(n) ? 0 : 2;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (k: string) => {
  const [, m, d] = k.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/**
 * Credit card bills Align found in Gmail. Reminders only start after the user says yes: then each bill is an
 * Agenda task with a notification 3 days before and on the due date, and the nightly WhatsApp summary
 * mentions it from 3 days out.
 */
export default function CardBills({ refreshKey }: { refreshKey: number }) {
  const c = useTheme();
  const [data, setData] = useState<{ reminders: boolean | null; bills: CardBill[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    gmailBills().then(setData).catch(() => setData(null));
  }, []);
  useEffect(load, [load, refreshKey]);

  const answer = async (remind: boolean) => {
    setBusy(true);
    try {
      const r = await gmailSetBillReminders(remind);
      setNote(remind ? (r.created ? `Added ${r.created} bill reminder${r.created === 1 ? '' : 's'} to your Agenda.` : 'Reminders on. New bills will be added to your Agenda.') : 'Card bill reminders are off.');
      load();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data || (!data.bills.length && data.reminders === null)) return null;

  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
      <View style={styles.head}>
        <CreditCard color={c.accent} size={18} />
        <Text style={[styles.title, { color: c.text }]}>Card bills</Text>
        {data.reminders !== null ? (
          <Switch
            accessibilityLabel="Card bill reminders"
            value={data.reminders}
            disabled={busy}
            onValueChange={(v) => void answer(v)}
            trackColor={{ false: c.backgroundMuted, true: c.accentFill }}
            style={{ marginLeft: 'auto' }}
          />
        ) : null}
      </View>

      {data.bills.length ? (
        <View style={{ gap: 6 }}>
          {data.bills.map((b) => (
            <View key={b.id} style={styles.bill}>
              <Text style={[styles.billName, { color: c.text }]} numberOfLines={1}>{b.issuerName}{b.last4 ? ` ••${b.last4}` : ''}</Text>
              <Text style={[styles.billMeta, { color: c.textSecondary }]}>{inr(b.totalDue)} · due {day(b.dueDate)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.body, { color: c.textSecondary }]}>No upcoming bills right now. New ones are picked up from your bank emails.</Text>
      )}

      {data.reminders === null ? (
        <>
          <Text style={[styles.body, { color: c.text }]}>
            Remind you before these are due? You’ll get a notification 3 days before and on the due date, and a line in your nightly WhatsApp summary.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void answer(true)} style={[styles.btn, { backgroundColor: c.accentFill }]}>
              {busy ? <ActivityIndicator color={c.onAccent} /> : <Text style={{ color: c.onAccent, fontWeight: '700' }}>Yes, remind me</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void answer(false)} style={[styles.btn, { backgroundColor: c.backgroundMuted }]}>
              <Text style={{ color: c.text, fontWeight: '700' }}>No thanks</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={[styles.body, { color: c.textSecondary }]}>
          {data.reminders ? 'Reminders are on: 3 days before and on the due date, in the app and on WhatsApp. Paying the bill ticks it off.' : 'Reminders are off.'}
        </Text>
      )}
      {note ? <Text style={{ color: c.income, fontSize: 13, fontWeight: '600' }}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  bill: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  billName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  billMeta: { fontSize: 14 },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md },
});
