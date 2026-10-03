import { PermissionsAndroid, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlignSms } from '../../modules/align-sms';
import { db } from './firebase';
import { getItem, removeItem, setItem } from './storage';

const TOKEN_KEY = 'align_sms_ingest_token';

export function smsEndpoint() {
  if (Platform.OS === 'web') return typeof window !== 'undefined' ? `${window.location.origin}/api/ingest/sms` : '/api/ingest/sms';
  return `${process.env.EXPO_PUBLIC_API_URL || ''}/api/ingest/sms`;
}

/** Personal link with the key built in: the only thing an iPhone Shortcut needs. */
export function smsPersonalLink(token: string) {
  return `${smsEndpoint()}?k=${token}`;
}

const sha256 = (s: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);

export function getSmsToken() {
  return getItem(TOKEN_KEY);
}

/** Creates a new key (revoking the previous one on this device) and links it to the phone number. */
export async function createSmsToken(phone: string): Promise<string> {
  const old = await getItem(TOKEN_KEY);
  if (old) await deleteDoc(doc(db, 'planner_settings', `ingest_${await sha256(old)}`)).catch(() => {});
  const bytes = await Crypto.getRandomBytesAsync(24);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await setDoc(doc(db, 'planner_settings', `ingest_${await sha256(token)}`), { phone, createdAt: serverTimestamp() });
  await setItem(TOKEN_KEY, token);
  AlignSms?.configure(smsEndpoint(), token);
  return token;
}

export async function revokeSmsToken() {
  const token = await getItem(TOKEN_KEY);
  if (token) await deleteDoc(doc(db, 'planner_settings', `ingest_${await sha256(token)}`)).catch(() => {});
  await removeItem(TOKEN_KEY);
  AlignSms?.disable();
}

/** Whether this build can read SMS on its own (the Android APK). */
export const canAutoReadSms = !!AlignSms;

export function isAutoReadOn() {
  return !!AlignSms?.isConfigured();
}

export type EnableResult = { ok: true; imported: number; scanned: number } | { ok: false; reason: 'permission' | 'unsupported' };

/**
 * Android one-tap setup: ask for SMS permission, create/reuse the key, switch on the background
 * listener and import bank SMS from the last `days` days (duplicates are skipped server-side).
 */
export async function enableAndroidAutoImport(phone: string, days = 30): Promise<EnableResult> {
  if (!AlignSms) return { ok: false, reason: 'unsupported' };
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    PermissionsAndroid.PERMISSIONS.READ_SMS,
  ]);
  const granted = Object.values(res).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
  if (!granted) return { ok: false, reason: 'permission' };

  const token = (await getItem(TOKEN_KEY)) || (await createSmsToken(phone));
  AlignSms.configure(smsEndpoint(), token);

  const messages = await AlignSms.readRecentTransactionSms(days);
  let imported = 0;
  for (const m of messages) {
    try {
      const r = await fetch(smsEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // the SMS's own time, so older messages get their real date and time
        body: JSON.stringify({ token, text: m.text, date: m.date ? new Date(m.date).toISOString() : undefined }),
      });
      const data = await r.json().catch(() => ({}));
      if (data.status === 'added') imported++;
      if (r.status === 429) break; // hourly limit; the rest arrive as new SMS
    } catch {
      // offline: skip; new messages are queued natively
    }
  }
  return { ok: true, imported, scanned: messages.length };
}

/** Called on app start: resend SMS the background listener couldn't upload (e.g. while offline). */
export function flushPendingSms() {
  AlignSms?.flushPending().catch(() => {});
}
