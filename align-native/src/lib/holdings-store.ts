import { useEffect, useSyncExternalStore } from 'react';
import { auth, whenSignedIn } from '@/lib/firebase';
import { getItem, setItem } from '@/lib/storage';
import { Platform } from 'react-native';
import type { Holding, Nav } from '@/lib/portfolio';

/**
 * Investment holdings (yours, and family's you typed in) with today's mutual fund prices, shared by the Invest tab.
 * Shows the last known list at once (saved on the device, so it opens offline) and refreshes from the server when asked.
 */
export type HoldingsData = { holdings: Holding[]; navs: Record<string, Nav> };
export type HoldingInput = Omit<Holding, 'id' | 'asOf'>;
export type SchemeHit = { code: string; name: string; plan: string; option: string; nav: number; date: string };

const API_BASE = Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_API_URL || '';
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Something went wrong (${res.status}).`);
  return body as T;
}

let data: HoldingsData | null = null;
let owner: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const key = (phone: string) => `align_holdings_${phone}`;

function set(phone: string, next: HoldingsData) {
  if (phone !== owner || !next || !Array.isArray(next.holdings)) return;
  data = { holdings: next.holdings, navs: next.navs || {} };
  emit();
  void setItem(key(phone), JSON.stringify(data));
}

export function refreshHoldings(phone: string | null): Promise<void> {
  if (!phone) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = whenSignedIn(() => {
      call<HoldingsData>('/api/money/holdings')
        .then((d) => set(phone, d))
        .catch(() => { /* offline: keep what we have */ })
        .finally(() => { resolve(); setTimeout(() => stop(), 0); });
    });
  });
}

export function useHoldings(phone: string | null): HoldingsData | null {
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

/** Saves a new holding (no id) or changes one, then shows the saved list. Throws the server's message if it refuses. */
export async function saveHolding(phone: string | null, h: HoldingInput, id?: string): Promise<void> {
  await call('/api/money/holdings', { method: 'POST', body: JSON.stringify(id ? { id, edit: h } : { add: h }) });
  await refreshHoldings(phone);
}

export async function removeHolding(phone: string | null, id: string): Promise<void> {
  await call('/api/money/holdings', { method: 'POST', body: JSON.stringify({ remove: id }) });
  await refreshHoldings(phone);
}

/** Mutual funds by name, from AMFI's public list. */
export async function searchFunds(q: string): Promise<SchemeHit[]> {
  const r = await call<{ schemes: SchemeHit[] }>(`/api/market/mf?q=${encodeURIComponent(q)}`);
  return r.schemes || [];
}
