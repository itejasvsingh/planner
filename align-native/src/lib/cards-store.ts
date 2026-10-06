import { useEffect, useSyncExternalStore } from 'react';
import { whenSignedIn } from '@/lib/firebase';
import { getItem, setItem } from '@/lib/storage';
import { moneyAccounts, type AccountBalance, type CardSummary, type StatementCheck } from '@/lib/gmail-connect';

/**
 * Cards and bank balances, shared by Money → Cards, the card page and the transaction form's "Paid with".
 * Shows the last known list at once (saved on the device) and refreshes from the server when asked.
 */
export type MoneyAccounts = { cards: CardSummary[]; accounts: AccountBalance[]; checks?: StatementCheck[] };

let data: MoneyAccounts | null = null;
let owner: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const key = (phone: string) => `align_money_accounts_${phone}`;

function set(phone: string, next: MoneyAccounts) {
  if (phone !== owner) return;
  // Only a well-formed answer replaces what's shown
  if (!next || !Array.isArray(next.cards) || !Array.isArray(next.accounts)) return;
  data = next;
  emit();
  void setItem(key(phone), JSON.stringify(next));
}

/** Fetches the latest cards and balances (after an edit, or when Money → Cards opens). */
export function refreshCards(phone: string | null): Promise<void> {
  if (!phone) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = whenSignedIn(() => {
      moneyAccounts()
        .then((d) => set(phone, d))
        .catch(() => { /* offline: keep what we have */ })
        .finally(() => { resolve(); setTimeout(() => stop(), 0); });
    });
  });
}

export function useCards(phone: string | null): MoneyAccounts | null {
  useEffect(() => {
    if (!phone || owner === phone) return;
    owner = phone;
    data = null;
    emit();
    void getItem(key(phone)).then((raw) => {
      if (!raw || data || owner !== phone) return;
      try { data = JSON.parse(raw); emit(); } catch { /* ignore */ }
    });
  }, [phone]);
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => (phone && owner === phone ? data : null),
    () => null,
  );
}
