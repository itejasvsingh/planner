import { Platform } from 'react-native';
import { auth } from '@/lib/firebase';
import { canAutoReadSms, enableAndroidAutoImport, isAutoReadOn } from '@/lib/sms-import';

const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';

export type RefreshResult = { gmail: 'ok' | 'not_connected' | 'reconnect' | 'failed'; found: number; sms: number | null };

/**
 * Looks through the last 60 days of bank emails (server) and, in the Android app with SMS reading on, bank SMS
 * (re-sent to the server, which skips what it already has) for the latest balance of each account.
 */
export async function refreshBalances(phone: string | null): Promise<RefreshResult> {
  let gmail: RefreshResult['gmail'] = 'failed';
  let found = 0;
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${API_BASE}/api/money/refresh-balances`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.status) { gmail = data.status; found = Number(data.found) || 0; }
  } catch {}
  let sms: number | null = null;
  if (phone && canAutoReadSms && isAutoReadOn()) {
    const r = await enableAndroidAutoImport(phone, 60).catch(() => null);
    if (r && r.ok) sms = r.scanned;
  }
  return { gmail, found, sms };
}

export function refreshMessage(r: RefreshResult): string {
  const parts: string[] = [];
  if (r.gmail === 'ok') parts.push(r.found ? `${r.found} balance${r.found === 1 ? '' : 's'} found in emails` : 'no balances in emails');
  else if (r.gmail === 'reconnect') parts.push('reconnect Gmail to read emails');
  else if (r.gmail === 'failed') parts.push('could not read emails');
  if (r.sms !== null) parts.push(`${r.sms} SMS checked`);
  return parts.length ? parts.join(', ') : 'nothing to check yet';
}
