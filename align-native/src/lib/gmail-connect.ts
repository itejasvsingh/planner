import { AppState, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { auth } from '@/lib/firebase';
import { getItem, setItem } from '@/lib/storage';

const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';
const LAST_AUTO_SYNC = 'align_gmail_last_auto_sync';
const AUTO_SYNC_EVERY_MS = 15 * 60 * 1000;

export type GmailStatus =
  | { connected: false }
  | { connected: true; email: string; status: 'connected' | 'reconnect'; lastSyncAt: number | null; added: number; lastError: string | null };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Something went wrong (${res.status}).`);
  return data as T;
}

export const gmailStatus = () => call<GmailStatus>('/api/gmail/status');
export const gmailSyncNow = () => call<{ status: string; added: number; checked: number; message?: string }>('/api/gmail/sync', { method: 'POST' });
export const gmailDisconnect = () => call<{ connected: false }>('/api/gmail/disconnect', { method: 'POST' });

export type BankChoices = { banks: { id: string; name: string }[]; selected: string[] | null; detected: string[] | null; extra: string[] };
export const gmailBanks = () => call<BankChoices>('/api/gmail/banks');
export const gmailDetectBanks = () => call<{ detected: string[] }>('/api/gmail/banks/detect', { method: 'POST' });
export const gmailSaveBanks = (banks: string[], extra: string[]) =>
  call<{ ok: true; banks: string[]; extra: string[]; rereading: boolean }>('/api/gmail/banks', { method: 'POST', body: JSON.stringify({ banks, extra }) });

/**
 * Opens Google's consent screen. On the web the page navigates away and Google sends it back to
 * /settings/gmail?gmail=…; in the app an auth browser opens and closes on the align:// redirect.
 * Returns the outcome in the app, or null on the web (the page reloads).
 */
export async function connectGmail(): Promise<string | null> {
  const returnTo = Platform.OS === 'web' ? 'web' : 'app';
  const { url } = await call<{ url: string }>('/api/gmail/start', { method: 'POST', body: JSON.stringify({ returnTo }) });
  if (Platform.OS === 'web') {
    window.location.href = url;
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(url, 'align://settings/gmail');
  if (result.type !== 'success') return 'cancelled';
  return new URL(result.url).searchParams.get('gmail') || 'failed';
}

/** When the app opens or comes back to the front, ask the server to check Gmail (at most every 15 minutes). */
export function startGmailAutoSync() {
  const run = async () => {
    if (!auth.currentUser) return;
    const last = Number((await getItem(LAST_AUTO_SYNC)) || 0);
    if (Date.now() - last < AUTO_SYNC_EVERY_MS) return;
    await setItem(LAST_AUTO_SYNC, String(Date.now()));
    try {
      const s = await gmailStatus();
      if (s.connected && s.status === 'connected') await gmailSyncNow();
    } catch { /* offline or not set up; the 15-minute server job still runs */ }
  };
  void run();
  const sub = AppState.addEventListener('change', (state) => state === 'active' && void run());
  return () => sub.remove();
}

export type CardBill = { id: string; issuer: string; issuerName: string; last4: string | null; totalDue: number; minDue: number | null; dueDate: string };
export const gmailBills = () => call<{ reminders: boolean | null; bills: CardBill[] }>('/api/gmail/bills');
export const gmailSetBillReminders = (remind: boolean) =>
  call<{ reminders: boolean; created: number }>('/api/gmail/bills', { method: 'POST', body: JSON.stringify({ remind }) });

export type CardSummary = {
  key: string; issuer: string; issuerName: string; last4: string | null; statementDate: string | null; dueDate: string | null;
  totalDue: number; minDue: number | null; paidSince: number; spentSince: number; outstanding: number;
  status: 'paid' | 'due' | 'overdue'; daysLeft: number | null; manual: boolean; hidden: boolean; edited: boolean; remind: boolean;
};
export type CardEdit = {
  name?: string | null; last4?: string | null; hidden?: boolean; remind?: boolean | null; forDue?: string | null;
  totalDue?: number | null; minDue?: number | null; dueDate?: string | null; paid?: boolean | null;
};
export const editCard = (key: string, edit: CardEdit) => call<{ ok: true }>('/api/money/cards', { method: 'POST', body: JSON.stringify({ key, edit }) });
export const addCard = (edit: CardEdit) => call<{ ok: true; key: string }>('/api/money/cards', { method: 'POST', body: JSON.stringify({ add: edit }) });
export const removeCard = (key: string) => call<{ ok: true }>('/api/money/cards', { method: 'POST', body: JSON.stringify({ remove: key }) });
export type AccountBalance = { id: string; bankId: string; bankName: string; last4: string | null; balance: number; at: number };
/** Credit cards (statement, due date, outstanding now) and bank balances, read from bank emails and SMS. */
export type StatementCheck = {
  slot: string; bankName: string; kind: 'account' | 'card'; from: string | null; to: string | null;
  rows: number; added: number; checked: boolean; extras: { title: string; amount: number; date: string }[]; at: number;
  state?: 'ok' | 'needs_password' | 'wrong_password' | 'unreadable'; msgId?: string | null; foundAt?: number | null; line?: string;
};
export const moneyAccounts = () => call<{ cards: CardSummary[]; accounts: AccountBalance[]; checks?: StatementCheck[] }>('/api/money/accounts');

export type StatementKind = 'account' | 'card';
/** Statements found in Gmail for one bank and kind (bank account / credit card). */
export type StatementGroup = {
  bankId: string; bankName: string; kind: StatementKind; count: number; latest: number;
  locked: boolean | null; hasPassword: boolean; wrongPassword: boolean; selected: boolean;
};
export type StatementLists = { accounts: StatementGroup[]; cards: StatementGroup[]; searched: boolean };
/** Statements found so far, as two lists, and whether each bank's need a password. */
export const gmailStatements = () => call<StatementLists>('/api/gmail/statements');
/** Saves a bank's statement PDF password (kept encrypted on the server, never shown again); null removes it. */
export const gmailSetStatementPassword = (bank: string, kind: StatementKind, password: string | null) =>
  call<{ ok: true; hasPassword: boolean }>('/api/gmail/statements', { method: 'POST', body: JSON.stringify({ bank, kind, password }) });

/** Reads up to six new statement PDFs now, then checks the last 90 days of statements for passwords. */
export const gmailFindStatements = () =>
  call<StatementLists & { status: 'ok' | 'not_connected' | 'reconnect'; added: number }>('/api/gmail/statements/find', { method: 'POST' });
