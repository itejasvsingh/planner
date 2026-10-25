import { useMemo, useState } from 'react';
import { Linking, Modal, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, MapPin, Plus, Send } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePhone } from '@/lib/phone-context';
import { usePlannerItems } from '@/lib/use-planner-items';
import { boughtBuys, openBuys, parseBuyText, shareText, totalPrice, type BuyItem } from '@/lib/buy';
import { getPosition, geoSupported } from '@/lib/geo';
import { formatDateKey, todayKey } from '@/lib/dates';
import { triggerHaptic } from '@/lib/haptics';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const dayLabel = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return formatDateKey(d); };

/** Things you want to remember to buy: add in seconds, get reminded on a day or near a shop, ticked off when you buy it. */
export default function BuyScreen() {
  const c = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone } = usePhone();
  const { items, addItem, updateItem, deleteItem } = usePlannerItems(phone);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<BuyItem | null>(null);
  const [showBought, setShowBought] = useState(false);

  const open = useMemo(() => openBuys(items as BuyItem[]), [items]);
  const bought = useMemo(() => boughtBuys(items as BuyItem[]).slice(0, 30), [items]);
  const total = totalPrice(open);

  const add = async () => {
    if (!text.trim()) return;
    const { title, price } = parseBuyText(text);
    setText('');
    triggerHaptic('light');
    await addItem({ type: 'buy', title, price, done: false, createdDate: todayKey() } as any);
  };

  const share = async () => {
    const msg = shareText(open);
    if (Platform.OS === 'web') await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
    else await Share.share({ message: msg });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ChevronLeft color={c.accent} size={26} />
          <Text style={{ color: c.accent, fontSize: 16 }}>Back</Text>
        </Pressable>
        {open.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Send this list" hitSlop={10} onPress={() => void share()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Send color={c.accent} size={16} />
            <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>Send list</Text>
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={{ color: c.text, fontSize: 28, fontWeight: '800' }}>Buy later</Text>
          <Text style={{ color: c.textSecondary, fontSize: 14, marginTop: 2 }}>
            {open.length ? `${open.length} ${open.length === 1 ? 'thing' : 'things'}${total ? ` · about ${inr(total)}` : ''}` : 'Things you want to remember to buy'}
          </Text>
        </View>

        <View style={[styles.addRow, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
          <TextInput
            accessibilityLabel="Add something to buy"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => void add()}
            placeholder="e.g. batteries, headphones 2000"
            placeholderTextColor={c.textTertiary}
            returnKeyType="done"
            style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 10 }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Add" disabled={!text.trim()} onPress={() => void add()} style={[styles.addBtn, { backgroundColor: c.accentFill, opacity: text.trim() ? 1 : 0.4 }]}>
            <Plus color={c.onAccent} size={18} />
          </Pressable>
        </View>

        {open.length === 0 ? (
          <View style={[styles.empty, { borderColor: c.border }]}>
            <Text style={{ color: c.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Nothing to buy right now.{'\n'}Add it here, or text “buy batteries” to Align on WhatsApp or the quick-add bar.
            </Text>
          </View>
        ) : (
          <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
            {open.map((b, i) => (
              <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`Edit ${b.title}`} onPress={() => setEditing(b)}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={`Mark ${b.title} bought`} hitSlop={10}
                  onPress={() => { triggerHaptic('success'); void updateItem(b.id, { done: true }); }}
                  style={[styles.check, { borderColor: c.border }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{b.title}</Text>
                  {[b.price ? inr(b.price) : null, b.shop, b.remindOn ? `remind ${dayLabel(b.remindOn)}` : null, b.place ? (b.placeName || 'near a pinned place') : null].some(Boolean) && (
                    <Text style={{ color: c.textTertiary, fontSize: 13, marginTop: 2 }}>
                      {[b.price ? inr(b.price) : null, b.shop, b.remindOn ? `remind ${dayLabel(b.remindOn)}` : null, b.place ? `📍 ${b.placeName || 'pinned'}` : null].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {bought.length > 0 && (
          <View>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showBought }} onPress={() => setShowBought(!showBought)} style={{ paddingVertical: 8 }}>
              <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Bought · {bought.length} {showBought ? '▴' : '▾'}</Text>
            </Pressable>
            {showBought && (
              <View style={[styles.group, { backgroundColor: c.backgroundElement, borderColor: c.border }]}>
                {bought.map((b, i) => (
                  <Pressable key={b.id} accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel={`${b.title}, bought. Tap to put back`} onPress={() => void updateItem(b.id, { done: false, boughtTx: null })}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
                    <View style={[styles.check, { backgroundColor: c.income, borderColor: c.income }]}><Check color="#FFFFFF" size={13} strokeWidth={3} /></View>
                    <Text style={{ color: c.textTertiary, fontSize: 15, textDecorationLine: 'line-through', flex: 1 }}>{b.title}</Text>
                    {b.boughtTx ? <Text style={{ color: c.textTertiary, fontSize: 12 }}>matched a payment</Text> : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <BuySheet item={editing} onClose={() => setEditing(null)}
        onSave={async patch => { if (editing) await updateItem(editing.id, patch); setEditing(null); }}
        onDelete={async () => { if (editing) await deleteItem(editing.id); setEditing(null); }} />
    </View>
  );
}

function BuySheet({ item, onClose, onSave, onDelete }: { item: BuyItem | null; onClose: () => void; onSave: (patch: Record<string, unknown>) => Promise<void>; onDelete: () => Promise<void> }) {
  const c = useTheme();
  const [form, setForm] = useState({ title: '', price: '', shop: '', remindOn: '' });
  const [place, setPlace] = useState<{ lat: number; lng: number } | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Fill the form when a different item opens
  if (item && loadedFor !== item.id) {
    setLoadedFor(item.id);
    setForm({ title: item.title || '', price: item.price ? String(item.price) : '', shop: item.shop || '', remindOn: item.remindOn || '' });
    setPlace(item.place || null);
    setPlaceName(item.placeName || '');
    setErr('');
  }
  if (!item && loadedFor) setLoadedFor(null);

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1, borderColor: on ? c.accentFill : c.border, backgroundColor: on ? c.accentFill : c.backgroundElement }}>
      <Text style={{ color: on ? c.onAccent : c.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  const input = (label: string, key: 'title' | 'price' | 'shop', props: Record<string, unknown> = {}) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput accessibilityLabel={label} value={form[key]} onChangeText={v => setForm({ ...form, [key]: v })} placeholderTextColor={c.textTertiary}
        style={{ backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 16 }} {...props} />
    </View>
  );

  return (
    <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: c.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, gap: 12, maxHeight: '90%' }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <Text style={{ color: c.text, fontSize: 19, fontWeight: '700' }}>Edit item</Text>
            {input('What to buy', 'title')}
            {input('Price (optional)', 'price', { keyboardType: 'decimal-pad', placeholder: 'e.g. 2000' })}
            {input('Shop (optional, helps match the payment)', 'shop', { placeholder: 'e.g. Amazon, Decathlon' })}
            <View style={{ gap: 8 }}>
              <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>Remind me{form.remindOn ? ` on ${dayLabel(form.remindOn)}` : ''}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {chip('Tomorrow', form.remindOn === addDays(1), () => setForm({ ...form, remindOn: addDays(1) }))}
                {chip('In a week', form.remindOn === addDays(7), () => setForm({ ...form, remindOn: addDays(7) }))}
                {chip('Month end', false, () => { const d = new Date(); setForm({ ...form, remindOn: formatDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }); })}
                {chip('No date', !form.remindOn, () => setForm({ ...form, remindOn: '' }))}
              </View>
            </View>
            {geoSupported() && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '600' }}>Remind me near a shop</Text>
                {place ? (
                  <View style={{ gap: 8 }}>
                    <TextInput accessibilityLabel="Name this place" value={placeName} onChangeText={setPlaceName} maxLength={40} placeholder="Name this place (e.g. Pharmacy)" placeholderTextColor={c.textTertiary}
                      style={{ backgroundColor: c.backgroundElement, borderColor: c.border, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 16 }} />
                    <Pressable accessibilityRole="button" onPress={() => { setPlace(null); setPlaceName(''); }}><Text style={{ color: c.expense, fontWeight: '700', fontSize: 13 }}>Remove pin</Text></Pressable>
                    <Text style={{ color: c.textTertiary, fontSize: 12 }}>In the Android app, Align says so when you open it within about 300 m of here. It never tracks you in the background.</Text>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setBusy(true); setErr(''); getPosition().then(p => setPlace(p)).catch(e => setErr((e as Error).message)).finally(() => setBusy(false)); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                    <MapPin color={c.accent} size={18} />
                    <Text style={{ color: c.accent, fontWeight: '700' }}>{busy ? 'Finding you…' : 'Pin where I am now'}</Text>
                  </Pressable>
                )}
                {!!err && <Text style={{ color: c.expense, fontSize: 13 }}>{err}</Text>}
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable accessibilityRole="button" onPress={() => void onDelete()} style={{ paddingHorizontal: 18, justifyContent: 'center', borderRadius: Radius.md, backgroundColor: c.expenseSoft }}>
              <Text style={{ color: c.expense, fontWeight: '700' }}>Delete</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!form.title.trim()} onPress={() => void onSave({
              title: form.title.trim(),
              price: Number(form.price.replace(/,/g, '')) > 0 ? Number(form.price.replace(/,/g, '')) : null,
              shop: form.shop.trim() || null,
              remindOn: form.remindOn || null,
              place: place || null,
              placeName: place ? placeName.trim() || null : null,
            })} style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: Radius.md, backgroundColor: c.accentFill, opacity: form.title.trim() ? 1 : 0.5 }}>
              <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 16 }}>Save</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={{ paddingHorizontal: 14, justifyContent: 'center' }}>
              <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 4 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.lg, paddingLeft: 14, paddingRight: 8 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  group: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 28, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
});
