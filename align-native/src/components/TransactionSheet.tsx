import { Modal, View, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Colors, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ChevronDown, ChevronUp, MapPin, X, Trash2 } from 'lucide-react-native';
import { useState, useEffect, useRef } from 'react';
import SegmentedControl from './SegmentedControl';
import { DEFAULT_CATEGORY, categoriesFor, kindForType, resolveCategory, type CategoryKind } from '@/lib/categories';
import CategoryPicker from './CategoryPicker';
import { DatePick } from './form/QuickPick';
import { usePhone } from '@/lib/phone-context';
import { useCards } from '@/lib/cards-store';
import SplitSection from './SplitSection';
import { buildSplit, draftFrom, emptyDraft, splitOf, type SplitDraft } from '@/lib/splits';
import { useCategoryConfig } from '@/lib/use-category-config';
import { geoSupported, getPosition } from '@/lib/geo';
import { isLatLng, nearestPlace, type LatLng } from '@/lib/places';
import { savePlace, usePlaces } from '@/lib/places-store';
import { autoPlace } from '@/lib/auto-place';
import PlacesMap from '@/components/finance/PlacesMap';

const pad = (n: number) => String(n).padStart(2, '0');
const dateToKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = (k: string) => {
    const [y, m, d] = (k || dateToKey(new Date())).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};
const formatClock = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};
const SOURCE_NAME: Record<string, string> = { sms: 'SMS', email: 'email', gmail: 'Gmail', statement: 'a statement' };

interface TransactionSheetProps {
    visible: boolean;
    onClose: () => void;
    item: any | null; // null means adding a new item
    /** Friends you've split with, most recent first. */
    friends?: string[];
    /** Group names used on earlier splits, for one-tap tagging. */
    groups?: string[];
    groupDrafts?: Record<string, SplitDraft>;
    /** Adding from Money → Split: start with "Split with friends" on. */
    startSplit?: boolean;
    onSave: (updates: any) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

export default function TransactionSheet({ visible, onClose, item, onSave, onDelete, friends = [], groups = [], groupDrafts, startSplit = false }: TransactionSheetProps) {
    const { isDark } = useTheme();
    const c = isDark ? Colors.dark : Colors.light;
    const { config: categoryConfig, merchantRule } = useCategoryConfig();
    // Once you pick a category yourself, typing a known merchant doesn't change it
    const [categoryTouched, setCategoryTouched] = useState(false);

    const [type, setType] = useState('expense');
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState(DEFAULT_CATEGORY.expense);
        const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [isSplit, setIsSplit] = useState(false);
    const [cardLast4, setCardLast4] = useState<string | null>(null);
    const [disputed, setDisputed] = useState(false);
    const [bookmarked, setBookmarked] = useState(false);
    // Bookmark, leave out, monthly bill and split live under "More options", open only when one of them is on
    const [moreOpen, setMoreOpen] = useState(false);
    // Where it was spent: a pin (from your location or a saved place) and its name
    const savedPlaces = usePlaces();
    const [place, setPlace] = useState<LatLng | null>(null);
    const [placeName, setPlaceName] = useState('');
    const [placeBusy, setPlaceBusy] = useState(false);
    const [placeError, setPlaceError] = useState('');
    const [showMap, setShowMap] = useState(false);
    const [placeAuto, setPlaceAuto] = useState(false);
    const placeTouched = useRef(false);
    // Opening "More options" (or turning Split on) scrolls down so what appeared is in view
    const formScroll = useRef<ScrollView>(null);
    const scrollWhenGrown = useRef(false);
    const [excluded, setExcluded] = useState(false);
    const { phone } = usePhone();
    const cardData = useCards(phone);
        // Payment methods: cards and accounts
    const cardChoices = [
        ...(cardData?.cards || []).filter(k => (!k.hidden || k.last4 === item?.cardLast4)),
        ...(cardData?.accounts || []),
    ]
        .filter((k: any, i: number, all: any[]) => {
            const id = k.last4 || k.issuerName || k.bankName || k.name;
            return id && all.findIndex((x: any) => (x.last4 || x.issuerName || x.bankName || x.name) === id) === i;
        })
        .map((k: any) => ({
            key: k.key || k.id,
            label: k.last4 ? `${k.issuerName || k.bankName || k.name || 'Card'} ••${k.last4}` : (k.issuerName || k.bankName || k.name || 'Card'),
            last4: k.last4 || k.issuerName || k.bankName || k.name || null,
        }));
    const [splitDraft, setSplitDraft] = useState<SplitDraft>(emptyDraft);


    const detectedSource = !!item?.autoDetected && (item.cardLast4 || item.accountLast4) ? String(item.cardLast4 || item.accountLast4) : null;
    const detectedLabel = cardChoices.find(o => o.last4 === detectedSource || String(o.last4 || '').endsWith(detectedSource || '\0'))?.label || `••${detectedSource}`;

    useEffect(() => {
        if (visible) {
            setCategoryTouched(!!item);
            setCardLast4(item?.cardLast4 || null);
            setDisputed(false);
            setBookmarked(item?.bookmarked === true);
            setPlace(isLatLng(item?.place) ? { lat: item.place.lat, lng: item.place.lng } : null);
            setPlaceName(item?.placeName || '');
            setPlaceError('');
            setShowMap(false);
            setPlaceAuto(false);
            placeTouched.current = false;
            // A new expense is pinned where you are now, unless you change it first (or turned automatic pinning off)
            if (!item) void autoPlace().then(r => { if (r && !placeTouched.current) { setPlace(r.place); if (r.placeName) setPlaceName(r.placeName); setPlaceAuto(true); } });
            setMoreOpen(startSplit || (!!item && (item.bookmarked === true || item.excluded === true || !!item.isRecurring || !!splitOf(item) || isLatLng(item.place))));
            setExcluded(item?.excluded === true);
            // Keep the time the bank gave (editing must never wipe it)
            setTime(item?.time || '');
            if (item) {
                setType(kindForType(item.type));
                setTitle(item.title || '');
                const split = splitOf(item);
                // A split expense keeps your share as its amount; the form edits the whole bill.
                setAmount(split ? String(split.total) : item.amount ? String(item.amount) : '');
                setCategory(resolveCategory(item.category, kindForType(item.type), categoryConfig).name);
                setDate(item.date || dateToKey(new Date()));
                setIsRecurring(!!item.isRecurring);
                setIsSplit(!!split);
                setSplitDraft(split ? draftFrom(split) : emptyDraft());
            } else {
                setType('expense');
                setTitle('');
                setAmount('');
                setCategory(DEFAULT_CATEGORY.expense);
                setDate(dateToKey(new Date()));
                setIsRecurring(false);
                setIsSplit(startSplit);
                setSplitDraft(emptyDraft());
            }
        }
        // Category config is read only when the sheet opens; re-running on a background sync would reset the form.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, item]);

    // Update default category when type changes
    useEffect(() => {
        if (!item) {
            // Keep a category that fits the new type (e.g. one a payee rule just picked)
            setCategory(prev => (categoriesFor(type as CategoryKind, categoryConfig).some(k => k.name === prev) ? prev : DEFAULT_CATEGORY[type as CategoryKind] ?? DEFAULT_CATEGORY.expense));
        }
    }, [type, item, categoryConfig]);

    const splitInvalid = isSplit && type === 'expense' && !!buildSplit(parseFloat(amount) || 0, splitDraft).error;
    const canSave = !!amount && !!title && !splitInvalid;

    const handleSave = async () => {
        if (!amount || !title) return; // Basic validation
        
        const finalAmount = parseFloat(amount) || 0;
        const splitting = isSplit && type === 'expense';
        const built = splitting ? buildSplit(finalAmount, splitDraft, item ? splitOf(item) : null) : null;
        if (built?.error) return; // shown under the split

        await onSave({
            type,
            title,
            amount: built?.split ? built.split.yourShare : finalAmount,
            category,
            date,
            // Only send a time when there is one: an empty value would erase the bank's time
            ...(time ? { time } : {}),
            isRecurring,
            bookmarked,
            excluded,
            place: type === 'expense' ? place : null,
            placeName: type === 'expense' && (place || placeName.trim()) ? placeName.trim() || null : null,
            ...(isRecurring ? { recurringFrequency: 'monthly' } : {}),
            // Which credit card paid (kept as-is when the choice isn't shown)
            ...(type === 'expense' && cardChoices.length ? { cardLast4: cardLast4 || null } : {}),
            // Turning a split off clears it, including older shapes
            ...(built?.split ? { split: built.split, splits: [] } : item && splitOf(item) ? { split: null, splits: [] } : {}),
        });
        // A place you named becomes a one-tap chip (and names later pins made nearby)
        if (type === 'expense' && place && placeName.trim()) void savePlace(placeName, place);
        onClose();
    };

    const handleDelete = async () => {
        if (item && item.id && onDelete) {
            await onDelete(item.id);
        }
        onClose();
    };


    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView 
                // Android resizes the window for the keyboard itself; shifting again made the whole sheet jump
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            >
                <View style={{ backgroundColor: c.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '92%' }}>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={[Type.title, { color: c.text }]}>{item ? 'Edit Transaction' : 'New Transaction'}</Text>
                        <Pressable onPress={onClose} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: c.backgroundMuted, borderRadius: Radius.pill }}>
                            <X color={c.textSecondary} size={18} />
                        </Pressable>
                    </View>

                    <ScrollView
                        ref={formScroll}
                        style={{ flexShrink: 1 }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ gap: 16, paddingBottom: 4 }}
                        onContentSizeChange={() => { if (scrollWhenGrown.current) { scrollWhenGrown.current = false; formScroll.current?.scrollToEnd({ animated: true }); } }}
                    >
                        <SegmentedControl 
                            tabs={['Expense', 'Income', 'Transfer']} 
                            activeTab={type === 'expense' ? 'Expense' : (type === 'transfer' ? 'Transfer' : 'Income')} 
                            onTabChange={(t) => setType(t.toLowerCase())} 
                        />

                        {/* Huge Amount Input */}
                        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                            <Text style={[Type.caption, { color: c.textTertiary, marginBottom: 4 }]}>Amount</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={[Type.displayLg, { fontSize: 28, color: type === 'income' ? c.income : (type === 'transfer' ? c.textSecondary : c.text), marginRight: 4 }]}>₹</Text>
                                <TextInput 
                                    accessibilityLabel="Amount"
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={c.textTertiary}
                                    style={[Type.displayLg, { fontSize: 28, color: type === 'income' ? c.income : (type === 'transfer' ? c.textSecondary : c.text), width: Math.max(44, (amount || '0').length * 18 + 14), textAlign: 'center', padding: 0, marginRight: 22 }]}
                                />
                            </View>
                        </View>

                        {/* Title */}
                        <View style={{ gap: 8 }}>
                            <TextInput
                                accessibilityLabel="Title"
                                value={title}
                                onChangeText={(t) => {
                                    setTitle(t);
                                    // A payee you've categorised before brings its category along (and Family /
                                    // your own accounts make it a transfer)
                                    const rule = merchantRule(t);
                                    if (rule && !categoryTouched) {
                                        if (!item && rule.transfer && type === 'expense') setType('transfer');
                                        if (!item && !rule.transfer && type === 'transfer') setType('expense');
                                        setCategory(rule.category);
                                    }
                                }}
                                placeholder="What was this for?"
                                placeholderTextColor={c.textTertiary}
                                style={{ backgroundColor: c.backgroundElement, borderWidth: 1, borderColor: c.border, color: c.text, paddingHorizontal: 14, paddingVertical: 11, borderRadius: Radius.md, fontSize: 16 }}
                            />
                        </View>

                        <View style={{ gap: 8 }}>
                            <DatePick value={keyToDate(date)} onChange={d => setDate(dateToKey(d))} mode="past" />
                            {item?.autoDetected ? (
                                <Text style={{ color: c.textTertiary, fontSize: 12 }}>
                                    {[item.time ? `Recorded at ${formatClock(item.time)}` : 'Recorded automatically', SOURCE_NAME[item.source] ? `from ${SOURCE_NAME[item.source]}` : '', item.ref ? `· ref ${item.ref}` : ''].filter(Boolean).join(' ')}
                                </Text>
                            ) : null}
                        </View>

                        {/* Category Selector */}
                        <View>
                            <Text style={[Type.label, { color: c.textSecondary, marginBottom: 8 }]}>Category</Text>
                            <CategoryPicker layout="row" kind={kindForType(type)} value={category} onChange={(v) => { setCategory(v); setCategoryTouched(true); }} />
                        </View>

                        {/* Paid with: read off the bank alert; only editable if the user says it's wrong */}
                        {type === 'expense' && detectedSource && !disputed && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[Type.label, { color: c.textSecondary }]}>Paid with</Text>
                                    <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{detectedLabel}</Text>
                                    <Text style={[Type.caption, { color: c.textTertiary }]}>Detected from your bank alert</Text>
                                </View>
                                <Pressable accessibilityRole="button" accessibilityLabel="Change what this was paid with" hitSlop={8} onPress={() => setDisputed(true)}>
                                    <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>Wrong?</Text>
                                </Pressable>
                            </View>
                        )}
                        {type === 'expense' && cardChoices.length > 0 && !(detectedSource && !disputed) && (
                            <View style={{ gap: 8 }}>
                                <Text style={[Type.label, { color: c.textSecondary }]}>Paid with</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                    {[{ key: '', label: 'Not a card', last4: null as string | null }, ...cardChoices].map(o => {
                                        const on = (cardLast4 || null) === o.last4;
                                        return (
                                            <Pressable key={o.key} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Paid with ${o.label}`}
                                                onPress={() => setCardLast4(o.last4)}
                                                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1, borderColor: on ? c.accentFill : c.border, backgroundColor: on ? c.accentFill : c.backgroundElement }}>
                                                <Text style={{ color: on ? c.onAccent : c.text, fontSize: 13, fontWeight: '600' }}>{o.label}</Text>
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        )}

                        {/* More options: folded away unless one is on */}
                        {(() => {
                            const rows = [
                                { label: 'Bookmark', hint: 'Find it later with the Bookmarked filter', on: bookmarked, set: setBookmarked, show: true },
                                { label: 'Leave out of cash flow', hint: 'Still listed, but in no total or chart', on: excluded, set: setExcluded, show: type !== 'transfer' },
                                { label: 'Monthly bill', hint: 'Remind me and auto-log this', on: isRecurring, set: setIsRecurring, show: type === 'expense' },
                                { label: 'Split with friends', hint: 'Share the bill; only your part counts as spent', on: isSplit, set: setIsSplit, show: type === 'expense' },
                            ].filter(r => r.show);
                            const active = [...rows.filter(r => r.on).map(r => r.label === 'Leave out of cash flow' ? 'Left out' : r.label === 'Split with friends' ? 'Split' : r.label), ...(place ? ['Place'] : [])];
                            const showPlace = type === 'expense' && (geoSupported() || savedPlaces.length > 0 || !!place);
                            return (
                                <View>
                                    <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} onPress={() => { scrollWhenGrown.current = !moreOpen; setMoreOpen(!moreOpen); }}
                                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[Type.label, { color: c.textSecondary }]}>More options</Text>
                                            {!moreOpen && active.length > 0 && <Text style={[Type.caption, { color: c.accent, fontWeight: '600' }]}>{active.join(' · ')}</Text>}
                                        </View>
                                        {moreOpen ? <ChevronUp color={c.textTertiary} size={18} /> : <ChevronDown color={c.textTertiary} size={18} />}
                                    </Pressable>
                                    {moreOpen && (
                                        <View style={{ backgroundColor: c.backgroundElement, borderWidth: 1, borderColor: c.border, borderRadius: Radius.lg, padding: 16, gap: 16, marginTop: 6 }}>
                                            {rows.map(r => (
                                                <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <View style={{ flex: 1, paddingRight: 12 }}>
                                                        <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>{r.label}</Text>
                                                        <Text style={[Type.caption, { color: c.textTertiary }]}>{r.hint}</Text>
                                                    </View>
                                                    <Pressable
                                                        accessibilityRole="switch"
                                                        accessibilityLabel={r.label}
                                                        accessibilityState={{ checked: r.on }}
                                                        onPress={() => { if (r.label === 'Split with friends' && !r.on) scrollWhenGrown.current = true; r.set(!r.on); }}
                                                        style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: r.on ? c.accentFill : c.backgroundMuted, padding: 2, justifyContent: 'center', alignItems: r.on ? 'flex-end' : 'flex-start' }}
                                                    >
                                                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }} />
                                                    </Pressable>
                                                </View>
                                            ))}
                                            {showPlace && (
                                                <View style={{ gap: 10 }}>
                                                    <View>
                                                        <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>Place</Text>
                                                        <Text style={[Type.caption, { color: c.textTertiary }]}>Where you spent it, to see spending by place</Text>
                                                    </View>
                                                    {place ? (
                                                        <View style={{ gap: 8 }}>
                                                            {showMap && <PlacesMap height={160} spots={[{ key: 'here', name: placeName.trim() || 'Here', named: true, total: Number(amount) || 0, count: 1, ids: [], lat: place.lat, lng: place.lng }]} />}
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                                <MapPin color={c.accent} size={18} />
                                                                <TextInput
                                                                    accessibilityLabel="Name this place"
                                                                    value={placeName}
                                                                    onChangeText={setPlaceName}
                                                                    maxLength={40}
                                                                    placeholder="Name this place (e.g. Office)"
                                                                    placeholderTextColor={c.textTertiary}
                                                                    style={{ flex: 1, backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 12, paddingVertical: 9, borderRadius: Radius.md, fontSize: 15 }}
                                                                />
                                                            </View>
                                                            <View style={{ flexDirection: 'row', gap: 16, paddingLeft: 26 }}>
                                                                <Pressable accessibilityRole="button" onPress={() => setShowMap(!showMap)} hitSlop={8}>
                                                                    <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{showMap ? 'Hide map' : 'Show map'}</Text>
                                                                </Pressable>
                                                                <Pressable accessibilityRole="button" onPress={() => { placeTouched.current = true; setPlaceAuto(false); setPlace(null); setPlaceName(''); }} hitSlop={8}>
                                                                    <Text style={{ color: c.expense, fontWeight: '700', fontSize: 13 }}>Remove place</Text>
                                                                </Pressable>
                                                            </View>
                                                        </View>
                                                    ) : (
                                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                            {geoSupported() && (
                                                                <Pressable
                                                                    accessibilityRole="button"
                                                                    disabled={placeBusy}
                                                                    onPress={() => {
                                                                        placeTouched.current = true; setPlaceAuto(false);
                                                                        setPlaceError('');
                                                                        setPlaceBusy(true);
                                                                        getPosition()
                                                                            .then(pos => { setPlace(pos); const near = nearestPlace(savedPlaces, pos); if (near) setPlaceName(near.name); })
                                                                            .catch(e => setPlaceError((e as Error).message))
                                                                            .finally(() => setPlaceBusy(false));
                                                                    }}
                                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: c.accentFill }}
                                                                >
                                                                    <MapPin color={c.onAccent} size={15} />
                                                                    <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 13 }}>{placeBusy ? 'Finding you…' : 'Use my location'}</Text>
                                                                </Pressable>
                                                            )}
                                                            {savedPlaces.slice(0, 6).map(sp => (
                                                                <Pressable key={sp.id} accessibilityRole="button" accessibilityLabel={`Place ${sp.name}`} onPress={() => { placeTouched.current = true; setPlaceAuto(false); setPlace({ lat: sp.lat, lng: sp.lng }); setPlaceName(sp.name); setPlaceError(''); }}
                                                                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: c.backgroundMuted }}>
                                                                    <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{sp.name}</Text>
                                                                </Pressable>
                                                            ))}
                                                        </View>
                                                    )}
                                                    {!!placeError && <Text accessibilityRole="alert" style={{ color: c.expense, fontSize: 13 }}>{placeError}</Text>}
                                                    {placeAuto && !!place && <Text style={[Type.caption, { color: c.textTertiary }]}>Pinned automatically from where you are now. Change or remove it anytime.</Text>}
                                                </View>
                                            )}
                                            {type === 'expense' && isSplit && (
                                                <SplitSection total={parseFloat(amount) || 0} draft={splitDraft} onChange={setSplitDraft} recent={friends} groups={groups} groupDrafts={groupDrafts} />
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })()}
                    </ScrollView>

                    {/* Actions: always visible below the form */}

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
                        {item && (
                            <Pressable onPress={handleDelete} style={{ flex: 1, backgroundColor: c.expenseSoft, padding: 14, borderRadius: Radius.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                                <Trash2 color={c.expense} size={18} />
                            </Pressable>
                        )}
                        <Pressable 
                            onPress={handleSave} 
                            style={{ flex: item ? 3 : 1, backgroundColor: canSave ? c.accentFill : c.backgroundMuted, padding: 14, borderRadius: Radius.md, alignItems: 'center' }}
                            disabled={!canSave}
                        >
                            <Text style={[Type.label, { color: canSave ? c.onAccent : c.textTertiary, fontWeight: '700', fontSize: 15 }]}>
                                {item ? 'Save Changes' : 'Add Transaction'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
