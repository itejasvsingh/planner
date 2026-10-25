import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { ChevronRight, Plus, Scale } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { changeEntry } from '@/lib/cards-store';
import { netWorth, type NetEntry } from '@/lib/net-worth';

const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;

type Sheet = { id: string | null; name: string; kind: 'asset' | 'liability'; value: string } | null;

/**
 * Money → Overview: net worth = what you have (ticked bank balances, things you add) less what you owe (credit cards,
 * loans you add). Tap a line you added to change or remove it; "Add" is for what Align can't read from alerts.
 */
export default function NetWorthCard({ phone, accounts, cards, entries, showBasics = true }: {
  phone: string | null;
  /** false when the same two figures (bank total, card dues) are already shown just above, as in Wallet */
  showBasics?: boolean;
  accounts: { balance: number; excluded?: boolean }[];
  cards: { outstanding: number; hidden?: boolean }[];
  entries: NetEntry[] | undefined;
}) {
  const c = useTheme();
  const nw = netWorth(accounts, cards, entries);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const open = (s: NonNullable<Sheet>) => { setError(''); setConfirmRemove(false); setSheet(s); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); setSheet(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = () => {
    if (!sheet) return;
    const value = Number(sheet.value.replace(/[,₹\s]/g, ''));
    if (!sheet.name.trim()) return setError('Give it a name.');
    if (!Number.isFinite(value) || value < 0 || sheet.value.trim() === '') return setError('Enter the value as a number, e.g. 250000.');
    const body = { name: sheet.name.trim(), kind: sheet.kind, value };
    void run(() => changeEntry(phone, sheet.id ? { id: sheet.id, edit: body } : { add: body }));
  };

  const lines: { key: string; label: string; value: number; sign: 1 | -1; entry?: NetEntry }[] = [
    ...(showBasics && (nw.bank > 0 || accounts.length) ? [{ key: 'bank', label: 'Bank accounts', value: nw.bank, sign: 1 as const }] : []),
    ...nw.customAssets.map(e => ({ key: e.id, label: e.name, value: e.value, sign: 1 as const, entry: e })),
    ...(showBasics && cards.length ? [{ key: 'cards', label: 'Credit card dues', value: nw.owedOnCards, sign: -1 as const }] : []),
    ...nw.customLiabilities.map(e => ({ key: e.id, label: e.name, value: e.value, sign: -1 as const, entry: e })),
  ];

  return (
    <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
      <View style={styles.head}>
        <Scale color={c.textTertiary} size={14} />
        <Text style={[styles.label, { color: c.textTertiary }]}>Net worth</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Add to your net worth" hitSlop={8} onPress={() => open({ id: null, name: '', kind: 'asset', value: '' })} style={styles.add}>
          <Plus color={c.accent} size={14} />
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 12 }}>Add</Text>
        </Pressable>
      </View>
      <Text accessibilityLabel={`Net worth ${inr(nw.net)}`} style={[styles.big, { color: nw.net < 0 ? c.expense : c.text }]} numberOfLines={1} adjustsFontSizeToFit>{inr(nw.net)}</Text>
      <Text style={{ color: c.textTertiary, fontSize: 12, marginTop: 2 }}>{inr(nw.assets)} you have · {inr(nw.liabilities)} you owe</Text>
      <View style={{ marginTop: 12 }}>
        {lines.map((l, i) => (
          <Pressable key={l.key} accessibilityRole={l.entry ? 'button' : 'text'} disabled={!l.entry}
            accessibilityLabel={l.entry ? `Change ${l.label}` : undefined}
            onPress={() => l.entry && open({ id: l.entry.id, name: l.entry.name, kind: l.entry.kind, value: String(l.entry.value) })}
            style={[styles.row, { borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 14, flex: 1 }} numberOfLines={1}>{l.label}</Text>
            <Text style={{ color: l.sign < 0 ? c.expense : c.text, fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] }}>{l.sign < 0 ? '−' : ''}{inr(l.value).replace('−', '')}</Text>
            {l.entry && <ChevronRight color={c.textTertiary} size={14} />}
          </Pressable>
        ))}
        {lines.length === 0 && <Text style={{ color: c.textSecondary, fontSize: 13 }}>{showBasics ? 'Connect Gmail for balances and card dues, or add what you own and owe.' : 'Bank balances and card dues are counted. Tap Add for what Align can’t read, like a flat or a loan.'}</Text>}
      </View>

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.background }]} onPress={() => {}}>
            {sheet && (
              <>
                <Text style={{ color: c.text, fontSize: 19, fontWeight: '800' }}>{sheet.id ? 'Change entry' : 'Add to your net worth'}</Text>
                <View style={[styles.seg, { backgroundColor: c.backgroundMuted }]}>
                  {(['asset', 'liability'] as const).map(k => (
                    <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: sheet.kind === k }} onPress={() => setSheet({ ...sheet, kind: k })}
                      style={[styles.segBtn, sheet.kind === k && { backgroundColor: c.accentFill }]}>
                      <Text style={{ color: sheet.kind === k ? c.onAccent : c.textSecondary, fontWeight: '700', fontSize: 13 }}>{k === 'asset' ? 'I own this' : 'I owe this'}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput accessibilityLabel="Name" placeholder={sheet.kind === 'asset' ? 'e.g. Flat, Gold, PPF' : 'e.g. Home loan, Loan from Rahul'} placeholderTextColor={c.textTertiary}
                  value={sheet.name} onChangeText={v => setSheet({ ...sheet, name: v })} maxLength={40}
                  style={[styles.input, { backgroundColor: c.backgroundElement, borderColor: c.border, color: c.text }]} />
                <TextInput accessibilityLabel="Value in rupees" placeholder="Value in ₹" placeholderTextColor={c.textTertiary} keyboardType="decimal-pad"
                  value={sheet.value} onChangeText={v => setSheet({ ...sheet, value: v })}
                  style={[styles.input, { backgroundColor: c.backgroundElement, borderColor: c.border, color: c.text }]} />
                {!!error && <Text accessibilityRole="alert" style={{ color: c.expense, fontSize: 13 }}>{error}</Text>}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {sheet.id && (
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => (confirmRemove ? void run(() => changeEntry(phone, { remove: sheet.id as string })) : setConfirmRemove(true))}
                      style={[styles.btn, { flex: confirmRemove ? 2 : 1, backgroundColor: c.expenseSoft }]}>
                      <Text style={{ color: c.expense, fontWeight: '700' }}>{confirmRemove ? 'Tap again to remove' : 'Remove'}</Text>
                    </Pressable>
                  )}
                  <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={[styles.btn, { flex: 2, backgroundColor: c.accentFill }]}>
                    <Text style={{ color: c.onAccent, fontWeight: '700' }}>{busy ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.xl, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  big: { fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 6, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: Radius.xl, padding: 20, gap: 12, width: '100%', maxWidth: 440, alignSelf: 'center' },
  seg: { flexDirection: 'row', padding: 3, borderRadius: Radius.md, gap: 2 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  btn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: Radius.md },
});
