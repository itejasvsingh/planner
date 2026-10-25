import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MessageSquareWarning } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { whenSignedIn } from '@/lib/firebase';
import { dismissUnread, unreadMessages, type UnreadMessage } from '@/lib/account-data';

const when = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Wallet → Couldn't read: bank messages that looked like payments but weren't understood (last 30 days), so nothing
 * disappears silently. SMS show a masked snippet (long numbers hidden); emails show only the bank and day. Add the
 * payment by hand with the + button, then dismiss the message.
 */
export default function UnreadMessages() {
  const c = useTheme();
  const [items, setItems] = useState<UnreadMessage[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { unreadMessages().then(setItems).catch(() => {}); }, []);
  useEffect(() => whenSignedIn(() => { load(); }), [load]);
  if (!items.length) return null;

  const remove = (id: string) => { setItems(l => l.filter(x => x.id !== id)); void dismissUnread(id); };

  return (
    <View style={[styles.box, { backgroundColor: c.warningSoft, borderColor: c.warningSoft }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.head}>
        <MessageSquareWarning color={c.warning} size={18} />
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 14, flex: 1 }}>
          {items.length} bank message{items.length === 1 ? '' : 's'} couldn’t be read
        </Text>
        <Text style={{ color: c.warning, fontWeight: '700', fontSize: 13 }}>{open ? 'Hide' : 'Review'}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: 10, paddingTop: 10 }}>
          <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
            These looked like payments, but Align didn’t understand them, so they aren’t in your spending. Log them with the box at the bottom, then dismiss them here.
          </Text>
          {items.map(m => (
            <View key={m.id} style={[styles.row, { backgroundColor: c.backgroundElement }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.textTertiary, fontSize: 11, fontWeight: '700' }}>{m.bank || (m.source === 'sms' ? 'SMS' : 'Email')} · {when(m.at)}</Text>
                <Text style={{ color: c.text, fontSize: 13 }}>{m.preview || 'A bank email about a payment (its text isn’t kept).'}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss this message" onPress={() => remove(m.id)} hitSlop={8}>
                <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>Dismiss</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: 12, marginTop: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.md, padding: 10 },
});
