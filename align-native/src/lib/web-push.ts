import { auth } from '@/lib/firebase';

/**
 * Push notifications on the web and the home-screen app (iPhone needs iOS 16.4+ and Align added to the Home Screen).
 * The Android app uses its own local reminders instead (see web-push.native.ts).
 */
export type PushStatus = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'off' | 'on';

const api = async (path: string, init: RequestInit = {}) => {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Something went wrong (${res.status}).`);
  return data;
};

const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => typeof window !== 'undefined' && ((navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches);

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
}

export async function pushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) return isIos() && !standalone() ? 'needs-install' : 'unsupported';
  // iPhone only exposes push to an app opened from the Home Screen
  if (isIos() && !standalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  try {
    const key = await fetch('/api/push/key').then(r => r.json());
    if (!key?.configured) return 'not-configured';
  } catch { /* offline: fall through to what the browser knows */ }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks for permission, subscribes this device and tells the server. Resolves to the status afterwards. */
export async function enablePush(): Promise<PushStatus> {
  const before = await pushStatus();
  if (before === 'unsupported' || before === 'needs-install' || before === 'not-configured') return before;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const { publicKey } = await fetch('/api/push/key').then(r => r.json());
  const reg = await registration();
  if (!reg || !publicKey) return 'unsupported';
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
  return 'on';
}

export async function disablePush(): Promise<PushStatus> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return 'off';
}

/** Sends one test notification to this person's devices; resolves to how many got it. */
export async function sendTestPush(): Promise<number> {
  const r = await api('/api/push/test', { method: 'POST' });
  return Number(r.sent) || 0;
}
