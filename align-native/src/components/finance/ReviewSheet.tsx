import { useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Flag } from '@/lib/suspicious';
import type { PlannerItem } from '@/lib/planner-item';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (t: PlannerItem) => {
  const d = t.date ? new Date(`${t.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  return [d, t.time || '', t.cardLast4 ? `card ••${t.cardLast4}` : '', t.source ? `from ${t.source === 'gmail' ? 'Gmail' : t.source === 'sms' ? 'SMS' : t.source}` : ''].filter(Boolean).join(' · ');
};

/** What to do about a payment you didn't make (India). */
function NotMeSteps() {
  const c = useTheme();
  const step = (n: number, text: string) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={{ color: c.expense, fontWeight: '800' }}>{n}.</Text>
      <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>{text}</Text>
    </View>
  );
  return (
    <View style={[styles.steps, { backgroundColor: c.expenseSoft }]}>
      <Text style={{ color: c.expense, fontWeight: '800' }}>Act now: the sooner, the better</Text>
      {step(1, 'Block the card or UPI in your bank’s app (Cards → Block/Lock), or call the number on the back of your card.')}
      {step(2, 'Tell your bank it was unauthorised and ask for a dispute/chargeback. Under RBI rules, reporting within 3 working days generally means you don’t bear the loss.')}
      {step(3, 'Report the fraud: call 1930 (National Cyber Crime Helpline) or file at cybercrime.gov.in.')}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Pressable accessibilityRole="button" onPress={() => void Linking.openURL('tel:1930')} style={[styles.small, { backgroundColor: c.expense }]}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Call 1930</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void Linking.openURL('https://cybercrime.gov.in')} style={[styles.small, { backgroundColor: c.backgroundElement }]}>
          <Text style={{ color: c.expense, fontWeight: '700' }}>cybercrime.gov.in</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Payments that look unusual for you, one by one: "This was me" quiets it; "Family / my account" turns it
 * into a transfer and remembers the payee; "Not me" keeps it flagged with what to do next.
 */
export default function ReviewSheet({ visible, flags, reported, onClose, onReview, onTransfer }: {
  visible: boolean;
  flags: Flag[];
  reported: PlannerItem[];
  onClose: () => void;
  onReview: (item: PlannerItem, review: 'mine' | 'not_me' | null) => void;
  onTransfer: (item: PlannerItem, category: 'Family' | 'Self Transfer') => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [notMe, setNotMe] = useState<string | null>(null);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Money" onPress={onClose} hitSlop={8} style={styles.back}>
            <ChevronLeft color={c.accent} size={24} />
            <Text style={{ color: c.accent, fontSize: 16, fontWeight: '600' }}>Money</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <Text style={{ color: c.text, fontSize: 24, fontWeight: '800' }}>Check these payments</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19 }}>
            Align compares new payments with your last 90 days. These look unusual for you. Most will be fine; tell Align
            and it won’t ask again. Money to family or your own accounts is never flagged once you mark it.
          </Text>

          {flags.length === 0 && reported.length === 0 && (
            <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, alignItems: 'center', gap: 8 }]}>
              <ShieldCheck color={c.income} size={28} />
              <Text style={{ color: c.text, fontWeight: '700' }}>Nothing unusual right now</Text>
            </View>
          )}

          {flags.map(({ item, reasons }) => (
            <View key={item.id} style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <ShieldAlert color={c.expense} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }} numberOfLines={2}>{item.title}</Text>
                  <Text style={{ color: c.textTertiary, fontSize: 12 }}>{when(item)}</Text>
                </View>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 17, fontVariant: ['tabular-nums'] }}>{inr(Number(item.amount) || 0)}</Text>
              </View>
              <View style={{ gap: 3, marginTop: 8 }}>
                {reasons.map(r => <Text key={r} style={{ color: c.textSecondary, fontSize: 13 }}>• {r}</Text>)}
              </View>
              {notMe === item.id ? (
                <>
                  <NotMeSteps />
                  <Pressable accessibilityRole="button" onPress={() => { onReview(item, 'not_me'); setNotMe(null); }} style={[styles.btn, { backgroundColor: c.expense, marginTop: 10 }]}>
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Mark as not mine</Text>
                  </Pressable>
                </>
              ) : (
                <View style={{ gap: 8, marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}: this was me`} onPress={() => onReview(item, 'mine')} style={[styles.btn, { flex: 1, backgroundColor: c.accentFill }]}>
                      <Text style={{ color: c.onAccent, fontWeight: '700' }}>This was me</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}: not me`} onPress={() => setNotMe(item.id)} style={[styles.btn, { flex: 1, backgroundColor: c.expenseSoft }]}>
                      <Text style={{ color: c.expense, fontWeight: '700' }}>Not me</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable accessibilityRole="button" onPress={() => onTransfer(item, 'Family')} style={[styles.btn, { flex: 1, backgroundColor: c.backgroundMuted }]}>
                      <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>Sent to family</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => onTransfer(item, 'Self Transfer')} style={[styles.btn, { flex: 1, backgroundColor: c.backgroundMuted }]}>
                      <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>My other account</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          ))}

          {reported.length > 0 && (
            <>
              <Text style={[styles.section, { color: c.textTertiary }]}>Reported as not mine</Text>
              {reported.map(item => (
                <View key={item.id} style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.expense }]}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '700' }} numberOfLines={1}>{item.title}</Text>
                      <Text style={{ color: c.textTertiary, fontSize: 12 }}>{when(item)}</Text>
                    </View>
                    <Text style={{ color: c.expense, fontWeight: '800' }}>{inr(Number(item.amount) || 0)}</Text>
                  </View>
                  <NotMeSteps />
                  <Pressable accessibilityRole="button" onPress={() => onReview(item, 'mine')} hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                    <Text style={{ color: c.textSecondary, fontWeight: '600', fontSize: 13 }}>Resolved / it was mine after all</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 8 },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: 14 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8 },
  btn: { paddingVertical: 11, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  small: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md },
  steps: { borderRadius: Radius.md, padding: 12, gap: 6, marginTop: 10 },
});
