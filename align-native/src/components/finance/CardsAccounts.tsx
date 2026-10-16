import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp, Copy, CreditCard, Landmark, Plus, ShieldCheck } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { changeAccount, refreshCards, useCards } from '@/lib/cards-store';
import BalanceTrend from './BalanceTrend';
import NetWorthCard from './NetWorthCard';
import BalanceOverview from './BalanceOverview';
import { todayKey } from '@/lib/dates';
import { adjustBalances, recentForAccount } from '@/lib/account-balances';
import { cardNumbers, cardStrip, cardTitle, detailsText, dueText, inr, nextStatement, shortDay } from '@/lib/card-format';
import type { CardSummary } from '@/lib/gmail-connect';
import CardSheet from './CardSheet';

const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/**
 * Wallet: credit cards (due date, outstanding now) and bank balances found in bank emails and SMS,
 * plus cards added by hand. Tap a card for its transactions and to edit it.
 */

export default function CardsAccounts({ phone, items = [], onOpenSettings, onEditTransaction }: {
  phone: string | null;
  items?: any[];
  onOpenSettings?: () => void;
  onEditTransaction?: (item: any) => void;
}) {
  const c = useTheme();
  const data = useCards(phone);
  const [open, setOpen] = useState<CardSummary | 'new' | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [openAcct, setOpenAcct] = useState<string | null>(null);
  const [form, setForm] = useState({ ifsc: '', accountNumber: '', holder: '' });
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState('');
  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  };

  useFocusEffect(useCallback(() => { void refreshCards(phone); }, [phone]));

  const baseCards = data?.cards || [];
  const baseAccounts = data?.accounts || [];
  const allChecks = data?.checks || [];
  
  // Realtime Sync with planner items
  const { cards, accounts, netWorth } = React.useMemo(() => adjustBalances(baseAccounts, baseCards, items), [baseAccounts, baseCards, items]);

  const shown = cards.filter(k => showHidden || !k.hidden);
  const hiddenCount = cards.filter(k => k.hidden).length;
  
  const checks = allChecks.filter(k => !k.state || k.state === 'ok');
  const waiting = allChecks.filter(k => k.state === 'needs_password' || k.state === 'wrong_password');
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
      

      <NetWorthCard phone={phone} accounts={accounts} cards={cards} entries={data?.entries} />
      <View style={{ height: 18 }} />
      <Text style={[styles.header, { color: c.textTertiary }]}>Credit cards & bills</Text>
      {shown.length > 1 && (
        <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, padding: 0, marginBottom: 12, overflow: 'hidden' }, Shadow.card]}>
          {shown.map((card, i) => {
            const strip = cardStrip(card);
            const bg = strip?.tone === 'overdue' ? c.expenseSoft : c.backgroundMuted;
            return (
              <Pressable key={card.key} accessibilityRole="button" accessibilityLabel={`${cardTitle(card)}: outstanding ${inr(card.outstanding)}${strip ? `. ${strip.text}` : ''}`}
                onPress={() => setOpen(card)} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border, padding: 12, gap: 8 }}>
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: c.accentSoft }]}><CreditCard color={c.accent} size={16} /></View>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 15, flex: 1 }} numberOfLines={1}>{cardTitle(card)}</Text>
                  <Text style={{ color: c.text, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] }}>{inr(card.outstanding)}</Text>
                </View>
                {strip && (
                  <View style={[styles.strip, { backgroundColor: bg }]}>
                    {strip.tone === 'overdue' && <AlertTriangle color={c.expense} size={14} />}
                    <Text style={{ color: strip.tone === 'overdue' ? c.expense : c.textSecondary, fontSize: 12, fontWeight: '600', flex: 1 }}>{strip.text}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
          <View style={[styles.row, { padding: 12, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border }]}>
            <Text style={{ color: c.textSecondary, fontWeight: '700', fontSize: 13 }}>Total owed</Text>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16, fontVariant: ['tabular-nums'] }}>{inr(shown.reduce((t, k) => t + (k.hidden ? 0 : k.outstanding), 0))}</Text>
          </View>
        </View>
      )}
      <View style={{ gap: 10 }}>
        {shown.map(card => {
          const tone = card.status === 'overdue' ? c.expense : card.status === 'paid' ? c.income : card.daysLeft !== null && card.daysLeft <= 3 ? c.expense : c.textSecondary;
          const details = detailsText(card);
          const nums = cardNumbers(card);
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
                  <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '600' }}>Outstanding</Text>
                  <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(card.outstanding)}</Text>
                </View>
                <ChevronRight color={c.textTertiary} size={16} />
              </View>
              <View style={styles.numbers}>
                {([
                  ['Limit', nums.limit], ['Billed', nums.billed], ['Unbilled', nums.unbilled], ['Left to spend', nums.left],
                ] as [string, number | null][]).filter(([, v]) => v !== null).map(([label, v]) => (
                  <View key={label} style={[styles.num, { backgroundColor: c.backgroundMuted }]}>
                    <Text style={{ color: c.textTertiary, fontSize: 11, fontWeight: '600' }}>{label}</Text>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(v as number)}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 8 }}>
                {[card.statementDate && card.totalDue ? `Statement ${inr(card.totalDue)}${card.status === 'paid' ? ' · paid' : ''}` : '', nextStatement(card.statementDate) ? `next about ${nextStatement(card.statementDate)}` : '', card.edited ? 'edited' : ''].filter(Boolean).join(' · ') || details}
              </Text>
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
          <View style={{ marginTop: 10 }}>
            <BalanceOverview rows={false} accounts={accounts} total={accounts.reduce((t, a) => t + (a.excluded ? 0 : a.balance), 0)} today={todayKey()} onToggle={() => {}} onOpen={() => {}} />
          </View>
        )}
        {accounts.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18 }}>
            <Text style={[styles.header, { color: c.textTertiary, marginBottom: 0 }]}>Bank balances</Text>
            {accounts.length > 1 && <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: '700' }}>Total {inr(accounts.reduce((t, a) => t + (a.excluded ? 0 : a.balance), 0))}</Text>}
          </View>
        )}
        {accounts.length > 0 && (
          <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, paddingVertical: 4 }, Shadow.card]}>
            {accounts.map((a, i) => {
              const recent = recentForAccount(a, items, 3);
              const open = openAcct === a.id;
              const included = !a.excluded;
              const details = [['Account number', a.accountNumber], ['IFSC', a.ifsc], ['Holder', a.holder]].filter(([, v]) => !!v) as [string, string][];
              return (
              <View key={a.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                <View style={[styles.row, { paddingVertical: 10 }]}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: included }}
                    accessibilityLabel={`Count ${a.bankName} ${a.last4 || ''} in the total`} hitSlop={8}
                    onPress={() => changeAccount(phone, a.id, { excluded: included }).catch(() => { /* undone on screen */ })}
                    style={[styles.check, included ? { backgroundColor: c.accentFill, borderColor: c.accentFill } : { borderColor: c.border }]}>
                    {included && <Check color={c.onAccent} size={14} strokeWidth={3} />}
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${a.bankName} ${a.last4 || ''} balance ${inr(a.balance)} as of ${when(a.at)}. ${open ? 'Hide' : 'Show'} details`}
                    onPress={() => { setOpenAcct(open ? null : a.id); setFormError(''); setForm({ ifsc: a.ifsc || '', accountNumber: a.accountNumber || '', holder: a.holder || '' }); }}
                    style={[styles.row, { flex: 1 }]}>
                    <View style={[styles.icon, { backgroundColor: c.backgroundMuted }]}><Landmark color={c.textSecondary} size={18} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{a.bankName}{a.last4 ? ` ••${a.last4}` : ''}</Text>
                      <Text style={{ color: c.textTertiary, fontSize: 12 }}>{included ? `Balance as of ${when(a.at)}` : 'Not counted in the total'}</Text>
                    </View>
                    <Text style={{ color: included ? c.text : c.textTertiary, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(a.balance)}</Text>
                    {open ? <ChevronUp color={c.textTertiary} size={16} /> : <ChevronDown color={c.textTertiary} size={16} />}
                  </Pressable>
                </View>
                {recent.map((t: any) => (
                  <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 78, paddingBottom: 6, gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 13, flex: 1 }}>{t.title || (t.type === 'income' ? 'Income' : 'Payment')}</Text>
                    <Text style={{ color: t.type === 'income' || t.type === 'deposit' ? c.income : c.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                      {t.type === 'income' || t.type === 'deposit' ? '+' : '−'}{inr(Number(t.amount) || 0)}
                    </Text>
                  </View>
                ))}
                {open && (
                  <View style={{ paddingHorizontal: 4, paddingBottom: 12, paddingTop: 4, gap: 12 }}>
                    <BalanceTrend history={a.history} />
                    {details.length > 0 && (
                      <View style={{ gap: 2 }}>
                        {details.map(([label, value]) => (
                          <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Copy ${label}`} onPress={() => void copy(`${a.id}${label}`, value)}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 }}>
                            <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '600', width: 110 }}>{label}</Text>
                            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{value}</Text>
                            {copied === `${a.id}${label}` ? <Check color={c.income} size={15} /> : <Copy color={c.textTertiary} size={15} />}
                          </Pressable>
                        ))}
                        <Pressable accessibilityRole="button" onPress={() => void copy(`${a.id}all`, [a.bankName, ...details.map(([l, v]) => `${l}: ${v}`)].join('\n'))}
                          style={[styles.add, { borderColor: c.border, marginTop: 6, borderStyle: 'solid' }]}>
                          <Text style={{ color: c.accent, fontWeight: '700' }}>{copied === `${a.id}all` ? 'Copied' : 'Copy all details'}</Text>
                        </Pressable>
                      </View>
                    )}
                    <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{details.length ? 'Edit bank details' : 'Add bank details to copy them anywhere'}</Text>
                    {([['Account number', 'accountNumber', 'numeric'], ['IFSC code', 'ifsc', 'default'], ['Account holder', 'holder', 'default']] as const).map(([label, field, kb]) => (
                      <TextInput key={field} accessibilityLabel={label} placeholder={label} placeholderTextColor={c.textTertiary}
                        value={form[field]} onChangeText={v => setForm({ ...form, [field]: v })} keyboardType={kb === 'numeric' ? 'number-pad' : 'default'}
                        autoCapitalize={field === 'ifsc' ? 'characters' : 'none'} autoCorrect={false}
                        style={[styles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]} />
                    ))}
                    {!!formError && <Text accessibilityRole="alert" style={{ color: c.expense, fontSize: 13 }}>{formError}</Text>}
                    <Pressable accessibilityRole="button" onPress={() => {
                      setFormError('');
                      changeAccount(phone, a.id, { accountNumber: form.accountNumber.trim() || null, ifsc: form.ifsc.trim() || null, holder: form.holder.trim() || null })
                        .catch(e => setFormError((e as Error).message));
                    }} style={[styles.add, { backgroundColor: c.accentFill, borderColor: c.accentFill, borderStyle: 'solid' }]}>
                      <Text style={{ color: c.onAccent, fontWeight: '700' }}>Save details</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              );
            })}
          </View>
        )}
        {(checks.length > 0 || waiting.length > 0) && (
          <>
            <Text style={[styles.header, { color: c.textTertiary, marginTop: 10, marginBottom: 0 }]}>Statement checks</Text>
            {waiting.map(k => (
              <Pressable key={k.slot} accessibilityRole="button" onPress={onOpenSettings} style={[styles.card, { backgroundColor: c.expenseSoft, borderColor: c.expenseSoft }]}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <AlertTriangle color={c.expense} size={18} />
                  <Text style={{ color: c.text, flex: 1, fontSize: 13, fontWeight: '600' }}>{k.line}</Text>
                  <Text style={{ color: c.expense, fontWeight: '700', fontSize: 13 }}>Add password</Text>
                </View>
              </Pressable>
            ))}
            {checks.map(k => {
              const ok = k.checked && !k.extras.length;
              const Icon = ok ? ShieldCheck : AlertTriangle;
              return (
                <View key={k.slot} style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: ok ? c.border : c.expense }]}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Icon color={ok ? c.income : k.checked ? c.expense : c.textTertiary} size={18} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: c.text, fontWeight: '700' }}>
                        {k.bankName} · {k.kind === 'card' ? 'card' : 'account'} statement{k.from && k.to ? ` ${shortDay(k.from)} – ${shortDay(k.to)}` : ''}
                      </Text>
                      <Text style={{ color: c.textSecondary, fontSize: 13 }}>
                        {k.rows} transactions{k.added ? `; ${k.added} that alerts missed are now added` : ', all already in Align'}.
                      </Text>
                      {!k.checked ? (
                        <Text style={{ color: c.textTertiary, fontSize: 12 }}>Couldn&apos;t compare with alerts: the email didn&apos;t name the account&apos;s last digits.</Text>
                      ) : k.extras.length ? (
                        <>
                          <Text style={{ color: c.expense, fontSize: 13, fontWeight: '600' }}>
                            {k.extras.length} payment{k.extras.length === 1 ? '' : 's'} from alerts {k.extras.length === 1 ? "isn't" : "aren't"} on this statement. Check for a duplicate or a different account:
                          </Text>
                          {k.extras.map(x => (
                            <Text key={`${x.date}${x.title}${x.amount}`} style={{ color: c.text, fontSize: 13 }}>• {x.title} · {inr(x.amount)} · {shortDay(x.date)}</Text>
                          ))}
                        </>
                      ) : (
                        <Text style={{ color: c.income, fontSize: 13, fontWeight: '600' }}>Everything Align recorded matches the statement.</Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </>
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
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  num: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm, minWidth: 92 },
  empty: { padding: 28, alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.sm },
  icon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
});
