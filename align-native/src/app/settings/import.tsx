import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronRight, CircleCheck, FileUp, Lock, X } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { Radius } from '@/constants/theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { useCategoryConfig } from '@/lib/use-category-config';
import { resolveCategory, tintColors } from '@/lib/categories';
import { triggerHaptic } from '@/lib/haptics';
import { pickStatement, readStatementFile, statementIds, type PickedStatement } from '@/lib/statement-import';
import { planRows, type PlannedRow } from '@/lib/statement-match';
import CategoryPicker from '@/components/CategoryPicker';

type Theme = ReturnType<typeof useTheme>;
type Step = 'pick' | 'reading' | 'password' | 'review' | 'saving' | 'done';

const inr = (n: number) => {
  const d = Number.isInteger(n) ? 0 : 2;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (d: string, withYear = false) => {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
};

function Step({ c, n, title, children }: { c: Theme; n: number; title: string; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: c.accentSoft }]}>
        <Text style={{ color: c.accent, fontWeight: '800', fontSize: 13 }}>{n}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.stepTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>{children}</Text>
      </View>
    </View>
  );
}

function PrimaryButton({ c, label, onPress, disabled, icon }: { c: Theme; label: string; onPress: () => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryBtn, { backgroundColor: disabled ? c.backgroundMuted : c.accentFill, opacity: pressed ? 0.75 : 1 }]}
    >
      {icon}
      <Text style={[styles.primaryText, { color: disabled ? c.textTertiary : c.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Import a bank or card statement: choose the file, unlock it if needed, review what was found (rows Align
 * already has are marked and left out), then add the chosen transactions.
 */
export default function ImportStatementScreen() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone } = usePhone();
  const { items, deletedIds, importItems } = usePlannerItems(phone);
  const { config, merchantCategory } = useCategoryConfig();

  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<PickedStatement | null>(null);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<PlannedRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<PlannedRow | null>(null);
  const [imported, setImported] = useState(0);

  // Your choice here, then the category you set for this merchant before, then Align's guess.
  const categoryOf = (r: PlannedRow) => categories[r.id] ?? merchantCategory(r.merchant) ?? resolveCategory(r.category, r.type, config).name;

  const read = async (f: PickedStatement, pw?: string) => {
    setStep('reading');
    setError('');
    const res = await readStatementFile(f, pw);
    if (res.status === 'password') {
      setPwError(res.incorrect ? "That password didn't open the file. Try again." : '');
      setStep('password');
      return;
    }
    if (res.status === 'error') {
      setError(res.message);
      setStep('pick');
      return;
    }
    const ids = await statementIds(phone || 'guest', res.rows);
    const planned = planRows(res.rows, ids, items, deletedIds).sort((a, b) => b.date.localeCompare(a.date));
    setRows(planned);
    setSelected(new Set(planned.filter(r => r.status === 'new').map(r => r.id)));
    setCategories({});
    setPassword('');
    setStep('review');
  };

  const choose = async () => {
    setError('');
    try {
      const picked = await pickStatement();
      if (!picked) return;
      setFile(picked);
      await read(picked);
    } catch {
      setError('Could not open that file.');
      setStep('pick');
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const choosable = rows.filter(r => r.status !== 'imported' && r.status !== 'deleted');
  const allOn = choosable.length > 0 && choosable.every(r => selected.has(r.id));
  const totals = useMemo(() => {
    let out = 0;
    let inn = 0;
    for (const r of rows) {
      if (!selected.has(r.id)) continue;
      if (r.type === 'expense') out += r.amount;
      else inn += r.amount;
    }
    return { out, inn };
  }, [rows, selected]);

  const save = async () => {
    const chosen = rows.filter(r => selected.has(r.id));
    if (!chosen.length) return;
    setStep('saving');
    await importItems(
      chosen.map(r => {
        const category = categoryOf(r);
        return {
          id: r.id,
          type: r.type,
          title: r.merchant,
          amount: r.amount,
          date: r.date,
          dueDate: r.date,
          category,
          tags: [category],
          splits: [],
          source: 'statement',
          ref: r.ref,
          autoDetected: true,
        };
      }),
    );
    triggerHaptic('success');
    setImported(chosen.length);
    setStep('done');
  };

  if (step === 'reading' || step === 'saving') {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} size="large" />
        <Text style={[styles.body, { color: c.textSecondary }]}>{step === 'reading' ? 'Reading your statement…' : 'Adding transactions…'}</Text>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={[styles.center, { backgroundColor: c.background, padding: 24 }]}>
        <CircleCheck color={c.income} size={56} strokeWidth={1.8} />
        <Text style={[styles.heroTitle, { color: c.text }]}>Imported {imported} transaction{imported === 1 ? '' : 's'}</Text>
        <Text style={[styles.body, { color: c.textSecondary, textAlign: 'center' }]}>They&apos;re in Money now and will sync in the background.</Text>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8, maxWidth: 480, width: '100%' }}>
          <PrimaryButton c={c} label="View in Money" onPress={() => router.replace('/(tabs)/finance')} />
          <Pressable accessibilityRole="button" onPress={() => { setRows([]); setFile(null); setStep('pick'); }} style={styles.linkBtn}>
            <Text style={[styles.link, { color: c.accent }]}>Import another statement</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 'password') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: c.accentSoft }]}>
            <Lock color={c.accent} size={22} />
          </View>
          <Text style={[styles.heroTitle, { color: c.text }]}>This statement is locked</Text>
          <Text style={[styles.body, { color: c.textSecondary, textAlign: 'center' }]}>
            Enter the PDF&apos;s password. Banks often use your customer ID, or part of your name with your date of birth; the email with the statement usually says which.
          </Text>
          <TextInput
            accessibilityLabel="Statement password"
            value={password}
            onChangeText={t => { setPassword(t); setPwError(''); }}
            placeholder="Password"
            placeholderTextColor={c.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={() => file && password && void read(file, password)}
            style={[styles.input, { color: c.text, backgroundColor: c.background, borderColor: pwError ? c.expense : c.border }]}
          />
          {!!pwError && <Text style={{ color: c.expense, fontSize: 13, alignSelf: 'flex-start' }}>{pwError}</Text>}
          <View style={{ alignSelf: 'stretch' }}>
            <PrimaryButton c={c} label="Unlock" disabled={!password} onPress={() => file && void read(file, password)} />
          </View>
          <Text style={[styles.hint, { color: c.textTertiary }]}>The password is only used to open this file. It isn&apos;t saved.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { setPassword(''); setStep('pick'); }} style={styles.linkBtn}>
          <Text style={[styles.link, { color: c.accent }]}>Choose another file</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (step === 'review') {
    const already = rows.filter(r => r.status === 'imported').length;
    const likely = rows.filter(r => r.status === 'likely').length;
    const dates = rows.map(r => r.date).sort();
    const range = dates.length ? `${shortDate(dates[0], true)} – ${shortDate(dates[dates.length - 1], true)}` : '';
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <FlatList
          data={rows}
          keyExtractor={r => r.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 140 + insets.bottom }]}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 12 }}>
              <View style={[styles.summary, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                <Text style={[styles.summaryTitle, { color: c.text }]}>{rows.length} transaction{rows.length === 1 ? '' : 's'} found</Text>
                <Text style={[styles.body, { color: c.textSecondary }]}>{range}</Text>
                {(already > 0 || likely > 0) && (
                  <Text style={[styles.body, { color: c.textSecondary }]}>
                    {already > 0 ? `${already} already in Align` : ''}
                    {already > 0 && likely > 0 ? ' · ' : ''}
                    {likely > 0 ? `${likely} look like ones you added (unticked)` : ''}
                  </Text>
                )}
              </View>
              <View style={styles.listHead}>
                <Text style={[styles.section, { color: c.textSecondary }]}>TRANSACTIONS</Text>
                {choosable.length > 0 && (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setSelected(allOn ? new Set() : new Set(choosable.map(r => r.id)))}>
                    <Text style={[styles.link, { color: c.accent, fontSize: 14 }]}>{allOn ? 'Select none' : 'Select all'}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          }
          renderItem={({ item: r, index }) => {
            const on = selected.has(r.id);
            const done = r.status === 'imported' || r.status === 'deleted';
            const cat = resolveCategory(categoryOf(r), r.type, config);
            const Icon = cat.icon;
            const first = index === 0;
            const last = index === rows.length - 1;
            return (
              <View style={[styles.row, { backgroundColor: c.backgroundElement, borderColor: c.border }, first && styles.rowFirst, last && styles.rowLast, !last && { borderBottomWidth: 0 }]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: done }}
                  accessibilityLabel={`${r.merchant}, ${inr(r.amount)}`}
                  disabled={done}
                  onPress={() => toggle(r.id)}
                  style={styles.rowMain}
                >
                  <View style={[styles.check, done ? { backgroundColor: c.backgroundMuted, borderColor: c.backgroundMuted } : on ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { borderColor: c.textTertiary }]}>
                    {(on || done) && <Check color={done ? c.textTertiary : c.onAccent} size={14} strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.rowTitle, { color: done ? c.textTertiary : c.text }]} numberOfLines={1}>{r.merchant}</Text>
                    <Text style={[styles.rowMeta, { color: r.status === 'likely' ? c.warning : c.textTertiary }]} numberOfLines={1}>
                      {shortDate(r.date)}
                      {r.status === 'deleted' ? ' · You deleted this' : done ? ' · Already in Align' : r.status === 'likely' ? ' · Looks like one you added' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: done ? c.textTertiary : r.type === 'income' ? c.income : c.text }]}>
                    {r.type === 'income' ? '+' : '−'}{inr(r.amount)}
                  </Text>
                </Pressable>
                {!done && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Category: ${cat.name}. Change`} onPress={() => setEditing(r)} style={[styles.catChip, { backgroundColor: tintColors(cat.tint, c.isDark).bg }]}>
                    <Icon size={13} color={tintColors(cat.tint, c.isDark).fg} />
                    <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{cat.name}</Text>
                    <ChevronRight size={12} color={c.textTertiary} />
                  </Pressable>
                )}
              </View>
            );
          }}
        />
        <View style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border, paddingBottom: 12 + insets.bottom }]}>
          {selected.size > 0 && (
            <Text style={[styles.rowMeta, { color: c.textSecondary, textAlign: 'center' }]}>
              {totals.out > 0 ? `${inr(totals.out)} out` : ''}
              {totals.out > 0 && totals.inn > 0 ? ' · ' : ''}
              {totals.inn > 0 ? `${inr(totals.inn)} in` : ''}
            </Text>
          )}
          <PrimaryButton
            c={c}
            disabled={!selected.size}
            label={selected.size ? `Import ${selected.size} transaction${selected.size === 1 ? '' : 's'}` : 'Nothing selected'}
            onPress={() => void save()}
          />
        </View>
        <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
          <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={() => setEditing(null)}>
            <Pressable style={[styles.sheet, { backgroundColor: c.background }]} onPress={() => {}}>
              <View style={styles.sheetHead}>
                <Text style={[styles.summaryTitle, { color: c.text, flex: 1 }]} numberOfLines={1}>{editing?.merchant}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setEditing(null)} style={[styles.round, { backgroundColor: c.backgroundMuted }]}>
                  <X color={c.textSecondary} size={18} />
                </Pressable>
              </View>
              {editing && (
                <CategoryPicker
                  kind={editing.type}
                  value={categoryOf(editing)}
                  onChange={name => {
                    const id = editing.id;
                    setCategories(prev => ({ ...prev, [id]: name }));
                    setEditing(null);
                  }}
                />
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={[styles.hero, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: c.accentFill }]}>
          <FileUp color={c.onAccent} size={22} />
        </View>
        <Text style={[styles.heroTitle, { color: c.text }]}>Import a bank statement</Text>
        <Text style={[styles.body, { color: c.textSecondary, textAlign: 'center' }]}>
          Add months of spending at once, so budgets and analysis start with real numbers.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
        <Step c={c} n={1} title="Download a statement">
          From your bank&apos;s app or net banking, as PDF, Excel (.xls, .xlsx) or CSV. Savings accounts and credit cards both work.
        </Step>
        <Step c={c} n={2} title="Choose the file here">
          Password-protected PDFs work; you&apos;ll be asked for the password.
        </Step>
        <Step c={c} n={3} title="Review and import">
          Pick what to add and fix categories. Transactions already in Align, including ones from SMS, are skipped.
        </Step>
        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: c.expenseSoft }]}>
            <Text style={{ color: c.expense, fontSize: 14, fontWeight: '600' }}>{error}</Text>
          </View>
        )}
        <PrimaryButton c={c} label="Choose statement file" icon={<FileUp color={c.onAccent} size={18} />} onPress={() => void choose()} />
      </View>
      <Text style={[styles.hint, { color: c.textTertiary }]}>
        The file is read on Align&apos;s server to find the transactions and is not stored or shared. Only the transactions you import are saved.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 48, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  hero: { alignItems: 'center', gap: 10, padding: 20, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  heroIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 18 },
  step: { flexDirection: 'row', gap: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 16, fontWeight: '700' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.md },
  primaryText: { fontSize: 16, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: 12 },
  link: { fontSize: 15, fontWeight: '600' },
  errorBox: { padding: 12, borderRadius: Radius.md },
  input: { alignSelf: 'stretch', borderWidth: 1, borderRadius: Radius.md, padding: 14, fontSize: 16 },
  listContent: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16 },
  summary: { padding: 16, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  summaryTitle: { fontSize: 18, fontWeight: '700' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  row: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  rowFirst: { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg },
  rowLast: { borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12 },
  amount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginLeft: 34, paddingHorizontal: 9, paddingVertical: 5, borderRadius: Radius.pill, maxWidth: '80%' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 20, paddingBottom: 36, gap: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
});
