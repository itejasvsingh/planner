import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, CreditCard, EyeOff, Eye, Pencil, Trash2 } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { DatePick } from '@/components/form/QuickPick';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlannerItems } from '@/lib/use-planner-items';
import { refreshCards } from '@/lib/cards-store';
import { cardTitle, detailsText, dueText, inr, shortDay } from '@/lib/card-format';
import { addCard, editCard, removeCard, type CardEdit, type CardSummary } from '@/lib/gmail-connect';

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (k: string | null) => (k ? new Date(`${k}T12:00:00`) : new Date());
const num = (s: string) => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * A credit card: what's owed and when, the transactions made with it, and editing (name, last digits,
 * this statement's amounts and due date, paid, hidden). `card` null = adding a card by hand.
 */
export default function CardSheet({ phone, card, visible, onClose, onEditTransaction }: {
  phone: string | null;
  card: CardSummary | null;
  visible: boolean;
  onClose: () => void;
  onEditTransaction: (item: any) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { items } = usePlannerItems(phone);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [form, setForm] = useState({ name: '', last4: '', totalDue: '', minDue: '', dueDate: null as string | null });

  useEffect(() => {
    if (!visible) return;
    setEditing(!card);
    setError('');
    setConfirmRemove(false);
    setForm({
      name: card?.issuerName || '',
      last4: card?.last4 || '',
      totalDue: card?.totalDue ? String(card.totalDue) : '',
      minDue: card?.minDue ? String(card.minDue) : '',
      dueDate: card?.dueDate || null,
    });
  }, [visible, card]);

  // Transactions made with this card (tagged with its last four digits), newest first
  const txns = useMemo(() => {
    if (!card?.last4) return [];
    return items
      .filter(i => i.cardLast4 === card.last4 && (i.type === 'expense' || i.type === 'income'))
      .sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`));
  }, [items, card]);
  const since = card?.statementDate || null;
  const recent = since ? txns.filter(t => (t.date || '') >= since) : txns;
  const earlier = since ? txns.filter(t => (t.date || '') < since) : [];

  async function run(fn: () => Promise<unknown>, close = false) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refreshCards(phone);
      if (close) onClose();
      else setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const last4 = form.last4.trim();
    if (last4 && !/^\d{4}$/.test(last4)) return setError('Last digits: exactly 4 numbers.');
    const totalDue = form.totalDue.trim() ? num(form.totalDue) : null;
    const minDue = form.minDue.trim() ? num(form.minDue) : null;
    if (form.totalDue.trim() && totalDue === null) return setError('Amount due: a number, e.g. 12450.50');
    const edit: CardEdit = { name: form.name.trim() || null, last4: last4 || null, totalDue, minDue, dueDate: form.dueDate };
    if (!card) {
      if (!edit.name) return setError('Give the card a name, e.g. "HDFC Millennia".');
      return void run(() => addCard(edit), true);
    }
    if (card.manual) return void run(() => editCard(card.key, edit));
    // Only what changed: amounts and due date then belong to the current statement
    const changes: CardEdit = { name: edit.name, last4: edit.last4 };
    if (totalDue !== card.totalDue) changes.totalDue = totalDue;
    if (minDue !== card.minDue) changes.minDue = minDue;
    if (form.dueDate !== card.dueDate) changes.dueDate = form.dueDate;
    if (Object.keys(changes).length > 2) changes.forDue = card.dueDate;
    void run(() => editCard(card.key, changes));
  }

  const field = (label: string, value: string, onChange: (v: string) => void, opts: { placeholder?: string; numeric?: boolean; max?: number } = {}) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={opts.placeholder}
        placeholderTextColor={c.textTertiary}
        keyboardType={opts.numeric ? 'decimal-pad' : 'default'}
        maxLength={opts.max}
        style={[styles.input, { backgroundColor: c.backgroundElement, borderColor: c.border, color: c.text }]}
      />
    </View>
  );

  const row = (t: any) => (
    <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`Edit ${t.title}`} onPress={() => onEditTransaction(t)}
      style={[styles.txn, { borderTopColor: c.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{t.title}</Text>
        <Text style={{ color: c.textTertiary, fontSize: 12 }}>{t.date ? shortDay(t.date) : ''}{t.category ? ` · ${t.category}` : ''}</Text>
      </View>
      <Text style={{ color: t.type === 'income' ? c.income : c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {t.type === 'income' ? '+' : '−'}{inr(Number(t.amount) || 0)}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to cards" onPress={onClose} hitSlop={8} style={styles.back}>
            <ChevronLeft color={c.accent} size={24} />
            <Text style={{ color: c.accent, fontSize: 16, fontWeight: '600' }}>Cards</Text>
          </Pressable>
          {card && !editing && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={card.hidden ? 'Show this card' : 'Hide this card'} disabled={busy}
                onPress={() => void run(() => editCard(card.key, { hidden: !card.hidden }), true)} style={[styles.iconBtn, { backgroundColor: c.backgroundMuted }]}>
                {card.hidden ? <Eye color={c.textSecondary} size={18} /> : <EyeOff color={c.textSecondary} size={18} />}
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Edit card" onPress={() => setEditing(true)} style={[styles.iconBtn, { backgroundColor: c.accentSoft }]}>
                <Pencil color={c.accent} size={18} />
              </Pressable>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          {editing ? (
            <>
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>{card ? 'Edit card' : 'Add a card'}</Text>
              {field('Name', form.name, v => setForm({ ...form, name: v }), { placeholder: 'e.g. HDFC Millennia', max: 40 })}
              {field('Last 4 digits', form.last4, v => setForm({ ...form, last4: v.replace(/\D/g, '') }), { placeholder: 'Links spends from alerts to this card', numeric: true, max: 4 })}
              {(card ? !!card.dueDate || card.manual : true) && (
                <>
                  <Text style={{ color: c.textTertiary, fontSize: 12 }}>{card && !card.manual ? 'This statement (a new statement replaces these):' : 'Current bill:'}</Text>
                  {field('Amount due', form.totalDue, v => setForm({ ...form, totalDue: v }), { placeholder: '0', numeric: true })}
                  {field('Minimum due', form.minDue, v => setForm({ ...form, minDue: v }), { placeholder: 'Optional', numeric: true })}
                  <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>Due date</Text>
                  <DatePick value={dateOf(form.dueDate)} onChange={d => setForm({ ...form, dueDate: keyOf(d) })} mode="future" />
                </>
              )}
              {!!error && <Text accessibilityRole="alert" style={{ color: c.expense }}>{error}</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                {card?.manual && (
                  <Pressable accessibilityRole="button" accessibilityLabel={confirmRemove ? 'Tap again to delete this card' : 'Delete card'} disabled={busy}
                    onPress={() => (confirmRemove ? void run(() => removeCard(card.key), true) : setConfirmRemove(true))}
                    style={[styles.btn, { flex: confirmRemove ? 2 : 1, backgroundColor: c.expenseSoft, flexDirection: 'row', gap: 6 }]}>
                    <Trash2 color={c.expense} size={16} />
                    {confirmRemove && <Text style={{ color: c.expense, fontWeight: '700' }}>Delete?</Text>}
                  </Pressable>
                )}
                {card && (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditing(false)} style={[styles.btn, { flex: 2, backgroundColor: c.backgroundMuted }]}>
                    <Text style={{ color: c.textSecondary, fontWeight: '700' }}>Cancel</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[styles.btn, { flex: 3, backgroundColor: c.accentFill }]}>
                  <Text style={{ color: c.onAccent, fontWeight: '700' }}>{busy ? 'Saving…' : card ? 'Save' : 'Add card'}</Text>
                </Pressable>
              </View>
            </>
          ) : card ? (
            <>
              <View style={[styles.summary, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><CreditCard color={c.accent} size={20} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>{cardTitle(card)}</Text>
                    <Text style={{ color: card.status === 'overdue' ? c.expense : card.status === 'paid' ? c.income : c.textSecondary, fontWeight: '600', fontSize: 13 }}>{dueText(card)}</Text>
                  </View>
                </View>
                <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '600', marginTop: 14 }}>Outstanding now</Text>
                <Text style={{ color: c.text, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(card.outstanding)}</Text>
                {!!detailsText(card) && <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }}>{detailsText(card)}{card.edited ? ' · edited by you' : ''}</Text>}
                {card.dueDate && (
                  <Pressable accessibilityRole="button" disabled={busy}
                    onPress={() => void run(() => editCard(card.key, { forDue: card.dueDate, paid: card.status !== 'paid' }))}
                    style={[styles.btn, { marginTop: 14, backgroundColor: card.status === 'paid' ? c.backgroundMuted : c.accentFill }]}>
                    <Text style={{ color: card.status === 'paid' ? c.textSecondary : c.onAccent, fontWeight: '700' }}>
                      {busy ? 'Saving…' : card.status === 'paid' ? 'Mark as not paid' : 'Mark this bill paid'}
                    </Text>
                  </Pressable>
                )}
                {!!error && <Text accessibilityRole="alert" style={{ color: c.expense, marginTop: 8 }}>{error}</Text>}
              </View>

              <Text style={[styles.section, { color: c.textTertiary }]}>{since ? `Since the ${shortDay(since)} statement` : 'Transactions'}</Text>
              {!card.last4 ? (
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Add the card&apos;s last 4 digits (Edit) to see the transactions made with it.</Text>
              ) : recent.length ? (
                <View style={[styles.list, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>{recent.map(row)}</View>
              ) : (
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>No spends on this card yet{since ? ' since the statement' : ''}. Pick it under “Paid with” when you add an expense.</Text>
              )}
              {earlier.length > 0 && (
                <>
                  <Text style={[styles.section, { color: c.textTertiary }]}>Earlier</Text>
                  <View style={[styles.list, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>{earlier.slice(0, 50).map(row)}</View>
                </>
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 8 },
  iconBtn: { height: 38, width: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  summary: { borderWidth: 1, borderRadius: Radius.lg, padding: 16 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6 },
  list: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, marginTop: -1 },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
  btn: { paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
