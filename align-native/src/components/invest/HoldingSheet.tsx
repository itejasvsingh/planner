import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { removeHolding, saveHolding, searchFunds, type SchemeHit } from '@/lib/holdings-store';
import { ME, TYPE_LABEL, TYPE_ORDER, type Holding, type HoldingType } from '@/lib/portfolio';

const toNum = (s: string) => { const t = s.replace(/[,₹\s]/g, ''); return t === '' ? null : Number(t); };
const show = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/**
 * Add or change one holding. Mutual funds are found by name from AMFI's public list and valued live from units; stocks, gold and
 * crypto take units and a price; FDs, PPF/EPF/NPS and anything else take a value you update by hand. `family`: names already used.
 */
export default function HoldingSheet({ visible, holding, phone, family, defaultOwner, onClose }: {
  visible: boolean;
  holding: Holding | null;
  phone: string | null;
  family: string[];
  defaultOwner: string;
  onClose: () => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<HoldingType>('mf');
  const [owner, setOwner] = useState(ME);
  const [newPerson, setNewPerson] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [name, setName] = useState('');
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [value, setValue] = useState('');
  const [invested, setInvested] = useState('');
  const [rate, setRate] = useState('');
  const [maturity, setMaturity] = useState('');
  const [schemeCode, setSchemeCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SchemeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<SchemeHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    const h = holding;
    setType(h?.type || 'mf');
    setOwner(h?.owner || defaultOwner || ME);
    setAddingPerson(false);
    setNewPerson('');
    setName(h?.name || '');
    setUnits(show(h?.units));
    setPrice(show(h?.price));
    setValue(show(h?.value));
    setInvested(h?.invested ? String(h.invested) : '');
    setRate(show(h?.rate));
    setMaturity(h?.maturity || '');
    setSchemeCode(h?.schemeCode || null);
    setQuery('');
    setHits([]);
    setPicked(null);
    setError('');
    setConfirmRemove(false);
  }, [visible, holding, defaultOwner]);

  // Search funds as the name is typed (after a short pause)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (type !== 'mf' || query.trim().length < 3) { setHits([]); return; }
    timer.current = setTimeout(() => {
      setSearching(true);
      searchFunds(query.trim()).then(setHits).catch(() => setHits([])).finally(() => setSearching(false));
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, type]);

  const people = [ME, ...family.filter(f => f !== ME)];
  const effectiveOwner = addingPerson ? newPerson.trim() || ME : owner;

  const save = async () => {
    setError('');
    const fields = { units: toNum(units), price: toNum(price), value: toNum(value), invested: toNum(invested), rate: toNum(rate) };
    if (Object.values(fields).some(v => v !== null && !Number.isFinite(v))) return setError('Numbers only, please.');
    setBusy(true);
    try {
      await saveHolding(phone, {
        owner: effectiveOwner,
        type,
        name: name.trim() || picked?.name || '',
        invested: fields.invested || 0,
        units: fields.units,
        price: type === 'mf' ? null : fields.price,
        value: fields.value,
        schemeCode: type === 'mf' ? schemeCode : null,
        rate: type === 'fd' || type === 'ppf' ? fields.rate : null,
        maturity: type === 'fd' && maturity.trim() ? maturity.trim() : null,
      }, holding?.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!holding) return;
    setBusy(true);
    try { await removeHolding(phone, holding.id); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const input = [styles.input, { color: c.text, backgroundColor: c.background, borderColor: c.border }];
  const chip = (selected: boolean) => [styles.chip, { backgroundColor: selected ? c.accentFill : c.backgroundMuted }];
  const chipText = (selected: boolean) => ({ color: selected ? c.onAccent : c.text, fontSize: 13, fontWeight: '600' as const });
  const label = (s: string) => <Text style={[styles.label, { color: c.textSecondary }]}>{s}</Text>;
  const field = (l: string, v: string, set: (s: string) => void, placeholder: string, kb: 'decimal-pad' | 'default' = 'decimal-pad') => (
    <View style={{ gap: 6 }}>
      {label(l)}
      <TextInput accessibilityLabel={l} value={v} onChangeText={t => { set(t); setError(''); }} placeholder={placeholder} placeholderTextColor={c.textTertiary} keyboardType={kb} autoCapitalize="none" style={input} />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.background, paddingTop: Math.max(insets.top, 12) }}>
        <View style={styles.bar}>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', flex: 1 }}>{holding ? 'Change holding' : 'Add a holding'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}><X color={c.textSecondary} size={24} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8 }}>
            {label('What is it?')}
            <View style={styles.wrap}>
              {TYPE_ORDER.map(t => (
                <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: type === t }} onPress={() => { setType(t); setError(''); }} style={chip(type === t)}>
                  <Text style={chipText(type === t)}>{TYPE_LABEL[t]}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            {label('Whose is it?')}
            <View style={styles.wrap}>
              {people.map(p => (
                <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: !addingPerson && owner === p }} onPress={() => { setOwner(p); setAddingPerson(false); }} style={chip(!addingPerson && owner === p)}>
                  <Text style={chipText(!addingPerson && owner === p)}>{p === ME ? 'Me' : p}</Text>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityState={{ selected: addingPerson }} onPress={() => setAddingPerson(true)} style={chip(addingPerson)}>
                <Text style={chipText(addingPerson)}>+ Someone in my family</Text>
              </Pressable>
            </View>
            {addingPerson && (
              <TextInput accessibilityLabel="Family member's name" value={newPerson} onChangeText={setNewPerson} placeholder="Their name, e.g. Mom" placeholderTextColor={c.textTertiary} maxLength={30} autoFocus style={input} />
            )}
            {(addingPerson || owner !== ME) && <Text style={{ color: c.textTertiary, fontSize: 12 }}>Kept in your account and labelled with their name. Their own Align account isn’t connected.</Text>}
          </View>

          {type === 'mf' ? (
            <View style={{ gap: 8 }}>
              {label('Fund')}
              {schemeCode ? (
                <View style={[styles.picked, { backgroundColor: c.accentSoft }]}>
                  <Text style={{ color: c.text, fontWeight: '700', flex: 1 }} numberOfLines={2}>{picked ? `${picked.name} · ${picked.plan} · ${picked.option}` : name}</Text>
                  <Pressable accessibilityRole="button" onPress={() => { setSchemeCode(null); setPicked(null); setQuery(''); }} hitSlop={8}><Text style={{ color: c.accent, fontWeight: '700' }}>Change</Text></Pressable>
                </View>
              ) : (
                <>
                  <TextInput accessibilityLabel="Search funds" value={query} onChangeText={setQuery} placeholder="Search by name, e.g. hdfc flexi cap direct" placeholderTextColor={c.textTertiary} autoCapitalize="none" autoCorrect={false} style={input} />
                  {searching && <ActivityIndicator color={c.accent} />}
                  {hits.map(h => (
                    <Pressable key={h.code} accessibilityRole="button" onPress={() => { setSchemeCode(h.code); setPicked(h); setName(h.name); setHits([]); }}
                      style={[styles.hit, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>{h.name}</Text>
                      <Text style={{ color: c.textTertiary, fontSize: 12 }}>{h.plan} · {h.option} · NAV ₹{h.nav} on {h.date}</Text>
                    </Pressable>
                  ))}
                  {query.trim().length >= 3 && !searching && hits.length === 0 && <Text style={{ color: c.textTertiary, fontSize: 12 }}>No fund found. Try fewer words, or leave the fund out and type its current value below.</Text>}
                </>
              )}
            </View>
          ) : (
            field('Name', name, setName, type === 'stock' ? 'e.g. Infosys' : type === 'fd' ? 'e.g. SBI FD' : type === 'gold' ? 'e.g. Gold coins' : 'Name', 'default')
          )}

          {type === 'mf' && field('Units you hold', units, setUnits, 'e.g. 12.543')}
          {(type === 'stock' || type === 'gold' || type === 'crypto') && (
            <>
              {field(type === 'gold' ? 'Grams' : type === 'crypto' ? 'Quantity' : 'Shares', units, setUnits, 'e.g. 10')}
              {field(type === 'gold' ? 'Price per gram (₹)' : 'Price per unit (₹)', price, setPrice, 'Update it when you like')}
            </>
          )}
          {(type === 'fd' || type === 'ppf' || type === 'other' || type === 'mf') && field(type === 'mf' ? 'Or type its current value (₹), if you can’t pick a fund' : 'Current value (₹)', value, setValue, 'e.g. 108000')}
          {field('Total you put in (₹)', invested, setInvested, 'Optional. Lets Align show your gain')}
          {(type === 'fd' || type === 'ppf') && field('Interest rate (%)', rate, setRate, 'e.g. 7.1')}
          {type === 'fd' && field('Matures on', maturity, setMaturity, 'e.g. 2027-03-05', 'default')}

          {!!error && <Text accessibilityRole="alert" style={{ color: c.expense, fontSize: 14 }}>{error}</Text>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.button, { backgroundColor: c.accentFill, opacity: busy ? 0.7 : 1 }]}>
            {busy ? <ActivityIndicator color={c.onAccent} /> : <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 16 }}>{holding ? 'Save changes' : 'Add holding'}</Text>}
          </Pressable>
          {holding && (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => (confirmRemove ? void remove() : setConfirmRemove(true))}
              style={[styles.button, { backgroundColor: confirmRemove ? c.expenseFill : c.expenseSoft }]}>
              <Text style={{ color: confirmRemove ? '#fff' : c.expense, fontWeight: '700', fontSize: 16 }}>{confirmRemove ? 'Tap again to remove it' : 'Remove this holding'}</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.md, padding: 12 },
  hit: { borderWidth: 1, borderRadius: Radius.md, padding: 12, gap: 2 },
  button: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
