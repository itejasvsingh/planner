import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronRight, CreditCard, Landmark, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { refreshCards, useCards } from '@/lib/cards-store';
import { cardTitle, detailsText, dueText, inr } from '@/lib/card-format';
import type { CardSummary } from '@/lib/gmail-connect';
import CardSheet from './CardSheet';

const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Money → Cards: credit cards (due date, outstanding now) and bank balances found in bank emails and SMS,
 * plus cards added by hand. Tap a card for its transactions and to edit it.
 */
export default function CardsAccounts({ phone, onOpenSettings, onEditTransaction }: {
  phone: string | null;
  onOpenSettings?: () => void;
  onEditTransaction?: (item: any) => void;
}) {
  const c = useTheme();
  const data = useCards(phone);
  const [open, setOpen] = useState<CardSummary | 'new' | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  useFocusEffect(useCallback(() => { void refreshCards(phone); }, [phone]));

  const cards = data?.cards || [];
  const shown = cards.filter(k => showHidden || !k.hidden);
  const hiddenCount = cards.filter(k => k.hidden).length;
  const accounts = data?.accounts || [];
  const sheet = (
    <CardSheet
      phone={phone}
      card={open === 'new' ? null : open}
      visible={open !== null}
      onClose={() => setOpen(null)}
      onEditTransaction={item => { setOpen(null); onEditTransaction?.(item); }}
    />
  );
  const addButton = (
    <Pressable accessibilityRole="button" onPress={() => setOpen('new')} style={[styles.add, { borderColor: c.border }]}>
      <Plus color={c.accent} size={16} />
      <Text style={{ color: c.accent, fontWeight: '700' }}>Add a card</Text>
    </Pressable>
  );
  const settingsLink = onOpenSettings ? (
    <Pressable accessibilityRole="button" onPress={onOpenSettings} hitSlop={6} style={{ alignSelf: 'center', paddingVertical: 12 }}>
      <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>Gmail, banks & statement passwords</Text>
    </Pressable>
  ) : null;

  if (!cards.length && !accounts.length) {
    return (
      <View style={{ gap: 12 }}>
        <View style={[styles.empty, { borderColor: c.border }]}>
          <CreditCard color={c.textTertiary} size={32} />
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Your cards and bank balances</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
            Connect Gmail and Align finds your credit card statements (due date, amount due, what you owe now) and your
            bank balances from alerts. Or add a card yourself.
          </Text>
        </View>
        {addButton}
        {settingsLink}
        {sheet}
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.header, { color: c.textTertiary }]}>Credit cards & bills</Text>
      <View style={{ gap: 10 }}>
        {shown.map(card => {
          const tone = card.status === 'overdue' ? c.expense : card.status === 'paid' ? c.income : card.daysLeft !== null && card.daysLeft <= 3 ? c.expense : c.textSecondary;
          const details = detailsText(card);
          return (
            <Pressable
              key={card.key}
              accessibilityRole="button"
              accessibilityLabel={`${cardTitle(card)}: outstanding ${inr(card.outstanding)}. ${dueText(card)}. Open card`}
              onPress={() => setOpen(card)}
              style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, opacity: card.hidden ? 0.6 : 1 }, Shadow.card]}
            >
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><CreditCard color={c.accent} size={18} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{cardTitle(card)}</Text>
                  <Text style={{ color: tone, fontSize: 13, fontWeight: '600', marginTop: 1 }}>{dueText(card)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: c.textTertiary, fontSize: 11, fontWeight: '600' }}>Outstanding</Text>
                  <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(card.outstanding)}</Text>
                </View>
                <ChevronRight color={c.textTertiary} size={16} />
              </View>
              {details ? <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 8 }}>{details}{card.edited ? ' · edited' : ''}</Text> : null}
            </Pressable>
          );
        })}
        {hiddenCount > 0 && (
          <Pressable accessibilityRole="button" onPress={() => setShowHidden(!showHidden)} hitSlop={6} style={{ alignSelf: 'center', paddingVertical: 4 }}>
            <Text style={{ color: c.textSecondary, fontWeight: '600', fontSize: 13 }}>
              {showHidden ? 'Hide hidden cards' : `Show ${hiddenCount} hidden card${hiddenCount === 1 ? '' : 's'}`}
            </Text>
          </Pressable>
        )}
        {addButton}
        {accounts.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
            <Text style={[styles.header, { color: c.textTertiary, marginBottom: 0 }]}>Bank balances</Text>
            {accounts.length > 1 && <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '700' }}>Total {inr(accounts.reduce((t, a) => t + a.balance, 0))}</Text>}
          </View>
        )}
        {accounts.length > 0 && (
          <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, paddingVertical: 4 }, Shadow.card]}>
            {accounts.map((a, i) => (
              <View key={a.id} style={[styles.row, { paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}
                accessible accessibilityLabel={`${a.bankName} ${a.last4 || ''} balance ${inr(a.balance)} as of ${when(a.at)}`}>
                <View style={[styles.icon, { backgroundColor: c.backgroundMuted }]}><Landmark color={c.textSecondary} size={18} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{a.bankName}{a.last4 ? ` ••${a.last4}` : ''}</Text>
                  <Text style={{ color: c.textTertiary, fontSize: 12 }}>Balance as of {when(a.at)}</Text>
                </View>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(a.balance)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      {settingsLink}
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { padding: 28, alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed' },
  icon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
