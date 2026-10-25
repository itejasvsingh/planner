import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp, Copy, CreditCard, Landmark, Plus } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/text';
import { Pressable } from '@/components/ui/pressable';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { changeAccount, refreshCards, useCards } from '@/lib/cards-store';
import BalanceTrend from './BalanceTrend';
import NetWorthCard from './NetWorthCard';
import BalanceOverview from './BalanceOverview';
import { todayKey } from '@/lib/dates';
import { summarizeStatement } from '@/lib/statement-summary';
import { setAccountBalance } from '@/lib/gmail-connect';
import { adjustBalances, recentForAccount, transactionsForAccount } from '@/lib/account-balances';
import { cardNumbers, cardStrip, cardTitle, detailsText, dueText, inr, nextStatement } from '@/lib/card-format';
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
  const [txAll, setTxAll] = useState<string | null>(null);
  const [balForm, setBalForm] = useState<Record<string, string>>({});
  const [balBusy, setBalBusy] = useState<string | null>(null);
  const [balErr, setBalErr] = useState('');
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
  
  // Realtime Sync with planner items
  const { cards, accounts, netWorth } = React.useMemo(() => adjustBalances(baseAccounts, baseCards, items), [baseAccounts, baseCards, items]);

  const shown = cards.filter(k => showHidden || !k.hidden);
  const hiddenCount = cards.filter(k => k.hidden).length;
  
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

  // Accounts seen in the transactions whose alerts never quote a balance: type it in once (shown even before any balance exists)
  const missingBlock = (() => {
          // Accounts that appear in your transactions but whose alerts never quote a balance (slice's, for one): type it in once
          const have = new Set(accounts.map(a => a.last4).filter(Boolean));
          const seen = new Map<string, { last4: string; bankId: string; bankName: string; count: number }>();
          for (const t of items as any[]) {
            if (!t.accountLast4 || have.has(t.accountLast4) || !['expense', 'income', 'deposit', 'transfer'].includes(t.type)) continue;
            const e = seen.get(t.accountLast4) || { last4: t.accountLast4, bankId: t.bankId || 'bank', bankName: t.bankName || 'Bank account', count: 0 };
            e.count += 1;
            seen.set(t.accountLast4, e);
          }
          const missing = [...seen.values()];
          if (!missing.length) return null;
          return (
            <>
              <Text style={[styles.header, { color: c.textTertiary, marginTop: 18, marginBottom: 8 }]}>Accounts without a balance</Text>
              <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border }, Shadow.card]}>
                {missing.map((m, i) => (
                  <View key={m.last4} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border, paddingVertical: 10, gap: 8 }}>
                    <View style={styles.row}>
                      <View style={[styles.icon, { backgroundColor: c.warningSoft }]}><Landmark color={c.warning} size={18} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{m.bankName} ••{m.last4}</Text>
                        <Text style={{ color: c.textTertiary, fontSize: 12 }}>{m.count} transaction{m.count === 1 ? '' : 's'} · its alerts don’t show a balance</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput accessibilityLabel={`Current balance of ${m.bankName} ${m.last4}`} placeholder="Current balance, e.g. 12500" placeholderTextColor={c.textTertiary}
                        value={balForm[m.last4] || ''} onChangeText={v => setBalForm({ ...balForm, [m.last4]: v })} keyboardType="decimal-pad"
                        style={[styles.input, { flex: 1, backgroundColor: c.background, borderColor: c.border, color: c.text }]} />
                      <Pressable accessibilityRole="button" disabled={balBusy === m.last4 || !(parseFloat((balForm[m.last4] || '').replace(/,/g, '')) >= 0)}
                        onPress={() => {
                          setBalErr('');
                          setBalBusy(m.last4);
                          setAccountBalance(m.bankId, m.last4, parseFloat((balForm[m.last4] || '').replace(/,/g, '')))
                            .then(() => refreshCards(phone))
                            .catch(e => setBalErr((e as Error).message))
                            .finally(() => setBalBusy(null));
                        }}
                        style={{ paddingHorizontal: 16, justifyContent: 'center', borderRadius: Radius.md, backgroundColor: parseFloat((balForm[m.last4] || '').replace(/,/g, '')) >= 0 ? c.accentFill : c.backgroundMuted }}>
                        <Text style={{ color: parseFloat((balForm[m.last4] || '').replace(/,/g, '')) >= 0 ? c.onAccent : c.textTertiary, fontWeight: '700' }}>{balBusy === m.last4 ? 'Saving…' : 'Save'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                {!!balErr && <Text accessibilityRole="alert" style={{ color: c.expense, fontSize: 13, paddingBottom: 8 }}>{balErr}</Text>}
                <Text style={{ color: c.textTertiary, fontSize: 12, paddingBottom: 10 }}>Type today’s balance once. From then on, every payment and credit on that account moves it, and any alert that does quote a balance corrects it.</Text>
              </View>
            </>
          );
        })();

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
        {missingBlock}
        {addButton}
        {settingsLink}
        {sheet}
      </View>
    );
  }

  return (
    <View>
      

      <NetWorthCard phone={phone} accounts={accounts} cards={cards} entries={data?.entries} showBasics={false} />
      <View style={{ height: 18 }} />
      <Text style={[styles.header, { color: c.textTertiary }]}>Credit cards & bills</Text>
      {shown.length > 1 && (
        <View style={[styles.card, { backgroundColor: c.backgroundElement, borderColor: c.border, padding: 0, marginBottom: 12, overflow: 'hidden' }, Shadow.card]}>
          {shown.map((card, i) => {
            const strip = cardStrip(card);
            // Red overdue, amber due within 3 days, green paid, blue otherwise
            const soon = !!strip && strip.tone === 'due' && card.daysLeft !== null && card.daysLeft <= 3;
            const fg = strip?.tone === 'overdue' ? c.expense : soon ? c.warning : strip?.tone === 'due' ? c.accent : c.textSecondary;
            const bg = strip?.tone === 'overdue' ? c.expenseSoft : soon ? c.warningSoft : strip?.tone === 'due' ? c.accentSoft : c.backgroundMuted;
            // A card with nothing to pay is green
            const paid = card.status === 'paid';
            const iconFg = paid ? c.income : strip ? fg : c.accent;
            const iconBg = paid ? c.incomeSoft : strip ? bg : c.accentSoft;
            return (
              <Pressable key={card.key} accessibilityRole="button" accessibilityLabel={`${cardTitle(card)}: outstanding ${inr(card.outstanding)}${strip ? `. ${strip.text}` : ''}`}
                onPress={() => setOpen(card)} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border, padding: 12, gap: 8 }}>
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: iconBg }]}><CreditCard color={iconFg} size={16} /></View>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 15, flex: 1 }} numberOfLines={1}>{cardTitle(card)}</Text>
                  <Text style={{ color: c.text, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] }}>{inr(card.outstanding)}</Text>
                </View>
                {strip && (
                  <View style={[styles.strip, { backgroundColor: bg }]}>
                    {(strip.tone === 'overdue' || soon) && <AlertTriangle color={fg} size={14} />}
                    <Text style={{ color: fg, fontSize: 12, fontWeight: '600', flex: 1 }}>{strip.text}</Text>
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
          const tone = card.status === 'overdue' ? c.expense : card.status === 'paid' ? c.income : card.daysLeft !== null && card.daysLeft <= 3 ? c.warning : c.accent;
          const tile = card.status === 'overdue' ? c.expenseSoft : card.status === 'paid' ? c.incomeSoft : card.daysLeft !== null && card.daysLeft <= 3 ? c.warningSoft : c.accentSoft;
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
                <View style={[styles.icon, { backgroundColor: tile }]}><CreditCard color={tone} size={18} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{cardTitle(card)}</Text>
                  <Text style={{ color: tone, fontSize: 13, fontWeight: '600', marginTop: 1 }}>{card.closed ? 'Closed' : dueText(card)}</Text>
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
                      <Text style={{ color: c.textTertiary, fontSize: 12 }}>{included ? `Balance as of ${when(a.at)}${(a as any).applied ? ` · ${(a as any).applied} newer applied` : ''}` : 'Not counted in the total'}</Text>
                    </View>
                    <Text style={{ color: included ? c.text : c.textTertiary, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(a.balance)}</Text>
                    {open ? <ChevronUp color={c.textTertiary} size={16} /> : <ChevronDown color={c.textTertiary} size={16} />}
                  </Pressable>
                </View>
                {!open && recent.map((t: any) => (
                  <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${t.title || 'Transaction'}, open`} onPress={() => onEditTransaction?.(t)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 78, paddingBottom: 6, gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 13, flex: 1 }}>{t.title || (t.type === 'income' ? 'Income' : 'Payment')}</Text>
                    <Text style={{ color: t.type === 'income' || t.type === 'deposit' ? c.income : c.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                      {t.type === 'income' || t.type === 'deposit' ? '+' : '−'}{inr(Number(t.amount) || 0)}
                    </Text>
                  </Pressable>
                ))}
                {open && (
                  <View style={{ paddingHorizontal: 4, paddingBottom: 12, paddingTop: 4, gap: 12 }}>
                    {(() => {
                      // Where this account's money went this month, and every transaction (tap one to open or remove it)
                      const all = transactionsForAccount(a, items) as any[];
                      const today = new Date();
                      const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      const month = a.last4 ? summarizeStatement(items as any, { id: 'month', bankId: a.bankId, bankName: a.bankName, kind: 'account', last4: a.last4, state: 'ok', from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today), at: 0 }) : null;
                      const shownTx = txAll === a.id ? all : all.slice(0, 8);
                      return (
                        <>
                          {month && (month.spent > 0 || month.received > 0 || month.transfers > 0) && (
                            <View style={{ gap: 6 }}>
                              <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>This month</Text>
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                <View style={[styles.num, { backgroundColor: c.backgroundMuted }]}>
                                  <Text style={{ color: c.textTertiary, fontSize: 11, fontWeight: '600' }}>Out</Text>
                                  <Text style={{ color: c.expense, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(month.spent + month.transfers)}</Text>
                                  {month.transfers > 0 && <Text style={{ color: c.textTertiary, fontSize: 11 }}>{inr(month.transfers)} transfers</Text>}
                                </View>
                                <View style={[styles.num, { backgroundColor: c.backgroundMuted }]}>
                                  <Text style={{ color: c.textTertiary, fontSize: 11, fontWeight: '600' }}>In</Text>
                                  <Text style={{ color: c.income, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(month.received)}</Text>
                                </View>
                              </View>
                              {month.categories.map(k => (
                                <View key={k.name} style={{ flexDirection: 'row', gap: 8 }}>
                                  <Text style={{ color: c.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{k.name}</Text>
                                  <Text style={{ color: c.textSecondary, fontSize: 14, fontVariant: ['tabular-nums'] }}>{inr(k.total)}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                          {all.length > 0 && (
                            <View style={{ gap: 6 }}>
                              <Text style={{ color: c.textTertiary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{all.length} transaction{all.length === 1 ? '' : 's'}</Text>
                              {shownTx.map(t => (
                                <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${t.title || 'Transaction'}, open`} onPress={() => onEditTransaction?.(t)} style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                                  <Text style={{ color: c.textTertiary, fontSize: 12, width: 44 }}>{t.date ? shortDayLocal(t.date) : ''}</Text>
                                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, flex: 1 }}>{t.title || (t.type === 'income' ? 'Income' : 'Payment')}</Text>
                                  <Text style={{ color: t.type === 'income' || t.type === 'deposit' ? c.income : c.text, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                                    {t.type === 'income' || t.type === 'deposit' ? '+' : '−'}{inr(Number(t.amount) || 0)}
                                  </Text>
                                </Pressable>
                              ))}
                              {all.length > 8 && (
                                <Pressable accessibilityRole="button" onPress={() => setTxAll(txAll === a.id ? null : a.id)} hitSlop={8} style={{ alignSelf: 'center' }}>
                                  <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{txAll === a.id ? 'Show fewer' : `Show all ${all.length}`}</Text>
                                </Pressable>
                              )}
                            </View>
                          )}
                        </>
                      );
                    })()}
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
        {missingBlock}
      </View>
      {settingsLink}
      {sheet}
    </View>
  );
}

const shortDayLocal = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

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
