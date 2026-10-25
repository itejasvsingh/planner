import { Platform, Share } from 'react-native';
import { auth } from '@/lib/firebase';

const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';

async function authed(path: string, init: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(`${API_BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
}

/** Everything Align keeps about you, as one JSON file: saved from the browser, or handed to the phone's share sheet. */
export async function downloadMyData(): Promise<void> {
  const res = await authed('/api/account/export');
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Something went wrong (${res.status}).`);
  const text = await res.text();
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'align-my-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  await Share.share({ title: 'My Align data', message: text });
}

/** Deletes the whole account and everything in it. Throws the server's message if it refuses. */
export async function deleteMyAccount(confirm: string): Promise<void> {
  const res = await authed('/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Something went wrong (${res.status}).`);
}

export type UnreadMessage = { id: string; source: 'sms' | 'email'; bank: string | null; preview: string | null; at: number };

/** Bank messages that looked like payments but weren't understood. */
export async function unreadMessages(): Promise<UnreadMessage[]> {
  const res = await authed('/api/money/unparsed');
  if (!res.ok) return [];
  return ((await res.json().catch(() => ({})))?.items || []) as UnreadMessage[];
}

export async function dismissUnread(id: string): Promise<void> {
  await authed('/api/money/unparsed', { method: 'POST', body: JSON.stringify({ dismiss: id }) });
}
