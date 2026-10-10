import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Check, Plus, Search, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { gmailBanks, gmailDetectBanks, gmailSaveBanks, type BankChoices } from '@/lib/gmail-connect';

/**
 * Which banks and cards Align reads from Gmail. Pre-ticks the ones found in the last six months; only the
 * ticked senders (plus any added addresses) are searched, which is quicker and reads less of your inbox.
 */
export default function BankPicker({ autoDetect, onSaved }: { autoDetect: boolean; onSaved: (rereading: boolean) => void }) {
  const c = useTheme();
  const [data, setData] = useState<BankChoices | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'detect' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const apply = (d: BankChoices) => {
    setData(d);
    setTicked(new Set(d.selected ?? d.detected ?? []));
    setExtra(d.extra);
  };

  const detect = async () => {
    setBusy('detect');
    setError('');
    try {
      const { detected } = await gmailDetectBanks();
      const d = await gmailBanks();
      apply({ ...d, detected });
      setTicked(new Set(d.selected?.length ? d.selected : detected));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    gmailBanks()
      .then((d) => {
        apply(d);
        if (autoDetect && d.detected === null) void detect();
      })
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const addExtra = () => {
    const v = draft.trim().toLowerCase();
    if (!/^(?:[a-z0-9._%+-]+@)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v)) {
      setError('Enter the bank’s email address, like alerts@mybank.in');
      return;
    }
    setExtra((prev) => [...new Set([...prev, v])].slice(0, 10));
    setDraft('');
    setError('');
  };

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      const r = await gmailSaveBanks([...ticked], extra);
      onSaved(r.rereading);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <ActivityIndicator color={c.accent} style={{ marginVertical: 12 }} />;
  const found = new Set(data.detected || []);
  const foundBanks = data.banks.filter((b) => found.has(b.id));
  const others = data.banks.filter((b) => !found.has(b.id));
  const visibleOthers = showAll || !foundBanks.length ? others : others.filter((b) => ticked.has(b.id));

  const Row = ({ id, name, tag }: { id: string; name: string; tag?: string }) => {
    const on = ticked.has(id);
    return (
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={name} onPress={() => toggle(id)} style={styles.row}>
        <View style={[styles.box, on ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { borderColor: c.textTertiary }]}>
          {on ? <Check color={c.onAccent} size={14} strokeWidth={3} /> : null}
        </View>
        <Text style={[styles.name, { color: c.text }]}>{name}</Text>
        {tag ? <Text style={[styles.tag, { color: c.income, backgroundColor: c.incomeSoft }]}>{tag}</Text> : null}
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.title, { color: c.text }]}>Your banks and cards</Text>
      <Text style={[styles.body, { color: c.textSecondary }]}>
        Align only searches emails from the ones you tick. Fewer banks means quicker checks and less of your inbox read.
      </Text>
      {busy === 'detect' ? (
        <View style={styles.detecting}>
          <ActivityIndicator color={c.accent} />
          <Text style={[styles.body, { color: c.textSecondary }]}>Looking for banks in your Gmail…</Text>
        </View>
      ) : null}
      {foundBanks.length ? (
        <View style={{ gap: 2 }}>
          {foundBanks.map((b) => <Row key={b.id} id={b.id} name={b.name} tag="Found in your Gmail" />)}
        </View>
      ) : data.detected && !busy ? (
        <Text style={[styles.body, { color: c.textSecondary }]}>No bank emails found in the last six months. Tick yours below or add its address.</Text>
      ) : null}
      {visibleOthers.length ? <View style={{ gap: 2 }}>{visibleOthers.map((b) => <Row key={b.id} id={b.id} name={b.name} />)}</View> : null}
      {foundBanks.length && !showAll ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={styles.link}>
          <Text style={{ color: c.accent, fontWeight: '600' }}>Show all banks and cards</Text>
        </Pressable>
      ) : null}

      {extra.map((x) => (
        <View key={x} style={styles.row}>
          <Text style={[styles.name, { color: c.text, flex: 1 }]}>{x}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${x}`} hitSlop={8} onPress={() => setExtra((p) => p.filter((y) => y !== x))}>
            <X color={c.textTertiary} size={18} />
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel="Bank email address"
          value={draft}
          onChangeText={setDraft}
          placeholder="Another bank’s email, e.g. alerts@mybank.in"
          placeholderTextColor={c.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          onSubmitEditing={addExtra}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Add bank email" onPress={addExtra} style={[styles.addBtn, { backgroundColor: c.backgroundMuted }]}>
          <Plus color={c.accent} size={18} />
        </Pressable>
      </View>

      {error ? <Text style={{ color: c.expense, fontSize: 13 }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: c.accentFill, opacity: pressed || busy ? 0.7 : 1 }]}>
          {busy === 'save' ? <ActivityIndicator color={c.onAccent} /> : <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 15 }}>Save {ticked.size + extra.length ? `(${ticked.size + extra.length})` : ''}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void detect()} style={({ pressed }) => [styles.save, { backgroundColor: c.backgroundMuted, opacity: pressed || busy ? 0.7 : 1, flexDirection: 'row', gap: 6 }]}>
          <Search color={c.accent} size={16} />
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 15 }}>Find again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  detecting: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, flexShrink: 1 },
  tag: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, overflow: 'hidden', marginLeft: 'auto' },
  link: { paddingVertical: 4 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBtn: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  save: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: Radius.md },
});
