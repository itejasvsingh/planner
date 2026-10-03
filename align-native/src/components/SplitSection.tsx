import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import SegmentedControl from './SegmentedControl';
import { YOU, buildSplit, describeSplit, equalShares, fmt, sameName, type SplitDraft, type SplitMethod } from '@/lib/splits';

const METHODS: { label: string; value: SplitMethod }[] = [
  { label: 'Equally', value: 'equal' },
  { label: 'Amounts', value: 'exact' },
  { label: 'Percent', value: 'percent' },
];

/**
 * Who shared this bill, who paid, and how it's divided (equally, by amounts or by percent).
 * `total` is the whole bill; the expense itself keeps only your share.
 */
export default function SplitSection({ total, draft, onChange, recent }: { total: number; draft: SplitDraft; onChange: (d: SplitDraft) => void; recent: string[] }) {
  const c = useTheme();
  const [name, setName] = useState('');
  const set = (patch: Partial<SplitDraft>) => onChange({ ...draft, ...patch });

  const addFriend = (raw: string) => {
    const n = raw.trim();
    setName('');
    if (!n || sameName(n, YOU) || draft.friends.some(f => sameName(f, n))) return;
    set({ friends: [...draft.friends, n] });
  };
  const removeFriend = (n: string) =>
    set({ friends: draft.friends.filter(f => f !== n), paidBy: sameName(draft.paidBy, n) ? YOU : draft.paidBy });

  const people = [YOU, ...draft.friends];
  const equal = equalShares(total, people.length);
  const result = draft.friends.length ? buildSplit(total, draft) : null;
  const suggestions = recent.filter(r => !draft.friends.some(f => sameName(f, r))).slice(0, 8);

  const chip = (selected: boolean) => ({
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.pill,
    backgroundColor: selected ? c.accentFill : c.backgroundMuted,
  });
  const chipText = (selected: boolean) => ({ color: selected ? c.onAccent : c.text, fontSize: 13, fontWeight: '600' as const });
  const label = (s: string) => <Text style={[Type.label, { color: c.textSecondary }]}>{s}</Text>;

  return (
    <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 16, marginTop: 4 }}>
      {/* With whom */}
      <View style={{ gap: 8 }}>
        {label('With')}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {draft.friends.map(f => (
            <Pressable key={f} accessibilityRole="button" accessibilityLabel={`Remove ${f}`} onPress={() => removeFriend(f)}
              style={[chip(true), { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <Text style={chipText(true)}>{f}</Text>
              <X color={c.onAccent} size={14} />
            </Pressable>
          ))}
          {suggestions.map(f => (
            <Pressable key={f} accessibilityRole="button" accessibilityLabel={`Add ${f}`} onPress={() => addFriend(f)}
              style={[chip(false), { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <Plus color={c.textSecondary} size={13} />
              <Text style={chipText(false)}>{f}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            accessibilityLabel="Friend's name"
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => addFriend(name)}
            blurOnSubmit={false}
            returnKeyType="done"
            placeholder="Add a friend by name"
            placeholderTextColor={c.textTertiary}
            style={{ flex: 1, backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md, fontSize: 15 }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Add friend" disabled={!name.trim()} onPress={() => addFriend(name)}
            style={{ paddingHorizontal: 14, justifyContent: 'center', borderRadius: Radius.md, backgroundColor: name.trim() ? c.accentFill : c.backgroundMuted }}>
            <Text style={{ color: name.trim() ? c.onAccent : c.textTertiary, fontWeight: '700' }}>Add</Text>
          </Pressable>
        </View>
      </View>

      {draft.friends.length > 0 && (
        <>
          {/* Who paid */}
          <View style={{ gap: 8 }}>
            {label('Paid by')}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {people.map(p => {
                const selected = sameName(draft.paidBy, p);
                return (
                  <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Paid by ${p === YOU ? 'you' : p}`}
                    onPress={() => set({ paidBy: p })} style={chip(selected)}>
                    <Text style={chipText(selected)}>{p === YOU ? 'You' : p}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* How */}
          <View style={{ gap: 8 }}>
            {label('Split')}
            <SegmentedControl
              tabs={METHODS.map(m => m.label)}
              activeTab={METHODS.find(m => m.value === draft.method)!.label}
              onTabChange={t => set({ method: METHODS.find(m => m.label === t)!.value })}
            />
            <View style={{ borderRadius: Radius.md, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
              {people.map((p, i) => (
                <View key={p} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, minHeight: 48, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, gap: 8 }}>
                  <Text style={{ flex: 1, color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{p === YOU ? 'You' : p}</Text>
                  {draft.method === 'equal' ? (
                    <Text style={{ color: c.textSecondary, fontSize: 15, fontVariant: ['tabular-nums'] }}>₹{fmt(equal[i] || 0)}</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {draft.method === 'exact' && <Text style={{ color: c.textSecondary }}>₹</Text>}
                      <TextInput
                        accessibilityLabel={`${p === YOU ? 'Your' : `${p}'s`} ${draft.method === 'exact' ? 'amount' : 'percent'}`}
                        value={(draft.method === 'exact' ? draft.exact : draft.percent)[p] ?? ''}
                        onChangeText={v => set(draft.method === 'exact' ? { exact: { ...draft.exact, [p]: v } } : { percent: { ...draft.percent, [p]: v } })}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={c.textTertiary}
                        style={{ width: 90, textAlign: 'right', backgroundColor: c.backgroundMuted, color: c.text, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.sm, fontSize: 15 }}
                      />
                      {draft.method === 'percent' && <Text style={{ color: c.textSecondary }}>%</Text>}
                    </View>
                  )}
                </View>
              ))}
            </View>
            {draft.method !== 'equal' && (
              <Pressable accessibilityRole="button" onPress={() => {
                // Start from an even split, then adjust
                if (draft.method === 'exact') set({ exact: Object.fromEntries(people.map((p, i) => [p, String(equal[i] || 0)])) });
                else set({ percent: Object.fromEntries(people.map((p, i) => [p, String(i ? Math.floor(10000 / people.length) / 100 : Math.round((100 - (people.length - 1) * Math.floor(10000 / people.length) / 100) * 100) / 100)])) });
              }} hitSlop={6}>
                <Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>Fill in evenly</Text>
              </Pressable>
            )}
          </View>

          {/* What it means */}
          {result?.error ? (
            <Text accessibilityLiveRegion="polite" style={{ color: c.expense, fontWeight: '600' }}>{result.error}</Text>
          ) : result?.split ? (
            <View style={{ gap: 2 }}>
              {describeSplit(result.split).map(line => (
                <Text key={line} style={{ color: c.text, fontWeight: '600' }}>{line}</Text>
              ))}
              <Text style={{ color: c.textTertiary, fontSize: 12 }}>Your share ₹{fmt(result.split.yourShare)} counts toward your spending.</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
