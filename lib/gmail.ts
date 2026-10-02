import { randomBytes } from 'node:crypto';
import { db, FieldValue } from './firebase';
import { open, seal } from './secretBox';
import { BANK_DOMAINS } from './bankSenders';
import { bankQuery, messageText, type GmailMessage } from './gmailMessage';
import { alertWindow } from './emailAlert';
import { parseTransactionSms } from './smsParse';
import { recordTransaction } from './recordTransaction';

/**
 * Connected Gmail (read-only). The user grants access once; Align keeps the refresh token encrypted in
 * `gmail_links/<phone>` (server-only) and reads only emails from bank senders, turning alerts into
 * transactions. Email content is not stored and never goes to AI (see /privacy).
 */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'https://alignplanner.vercel.app/api/gmail/callback';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const STATE_TTL_MS = 10 * 60 * 1000;
const BACKFILL_DAYS = 90;
const OVERLAP_SEC = 2 * 24 * 3600; // re-read the last two days each run; recording is idempotent
const MAX_MESSAGES_PER_RUN = 150;
const DAY_MS = 86400000;

const links = () => db.collection('gmail_links');
const states = () => db.collection('gmail_oauth_states');

export type ReturnTo = 'web' | 'app';

function oauthClient() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set.');
  return { id, secret };
}

function istDate(ms: number) {
  const d = new Date(ms + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Google's consent page for this user; `state` ties the answer back to their number. */
export async function startConnect(phone: string, returnTo: ReturnTo): Promise<string> {
  const { id } = oauthClient();
  const state = randomBytes(24).toString('base64url');
  await states().doc(state).set({ phone, returnTo, expiresAt: Date.now() + STATE_TTL_MS });
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: `openid email ${GMAIL_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type ConnectResult = { returnTo: ReturnTo; result: 'connected' | 'missing_scope' | 'expired' | 'failed'; phone?: string };

/** Google's redirect back: swap the code for tokens and keep the refresh token, encrypted. */
export async function finishConnect(code: string, state: string): Promise<ConnectResult> {
  const ref = states().doc(state || 'none');
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data) return { returnTo: 'web', result: 'expired' };
  await ref.delete();
  const returnTo: ReturnTo = data.returnTo === 'app' ? 'app' : 'web';
  const phone = String(data.phone);
  if (Date.now() > Number(data.expiresAt) || !code) return { returnTo, result: 'expired', phone };

  const { id, secret } = oauthClient();
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  const tok = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok || !tok.refresh_token) {
    console.warn('Gmail connect: token exchange failed', res.status, tok.error);
    return { returnTo, result: 'failed', phone };
  }
  // Google lets people untick the Gmail box on the consent screen.
  if (!String(tok.scope || '').split(' ').includes(GMAIL_SCOPE)) {
    await revoke(tok.refresh_token);
    return { returnTo, result: 'missing_scope', phone };
  }
  let email = '';
  try {
    email = JSON.parse(Buffer.from(String(tok.id_token).split('.')[1], 'base64url').toString('utf8')).email || '';
  } catch { /* the email is only shown in Settings */ }

  const previous = await links().doc(phone).get();
  if (previous.exists && previous.data()?.token) {
    await revoke(open(previous.data()!.token)).catch(() => {});
  }
  await links().doc(phone).set({
    email,
    token: seal(tok.refresh_token),
    status: 'connected',
    connectedAt: FieldValue.serverTimestamp(),
    lastSyncAt: null,
    syncedThrough: null,
    added: 0,
    lastError: null,
  });
  return { returnTo, result: 'connected', phone };
}

async function revoke(refreshToken: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => {});
}

export async function disconnect(phone: string) {
  const snap = await links().doc(phone).get();
  if (snap.exists && snap.data()?.token) {
    try {
      await revoke(open(snap.data()!.token));
    } catch { /* still delete our copy */ }
  }
  await links().doc(phone).delete();
}

export async function linkStatus(phone: string) {
  const snap = await links().doc(phone).get();
  if (!snap.exists) return { connected: false as const };
  const d = snap.data()!;
  return {
    connected: true as const,
    email: String(d.email || ''),
    status: d.status === 'reconnect' ? ('reconnect' as const) : ('connected' as const),
    lastSyncAt: typeof d.lastSyncAt === 'number' ? d.lastSyncAt : null,
    added: Number(d.added || 0),
    lastError: d.lastError ? String(d.lastError) : null,
  };
}

async function accessToken(refreshToken: string): Promise<string | 'revoked'> {
  const { id, secret } = oauthClient();
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: 'refresh_token' }),
  });
  const tok = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (tok.error === 'invalid_grant') return 'revoked';
  if (!res.ok || !tok.access_token) throw new Error(`Google token refresh failed (${res.status} ${tok.error || ''})`);
  return tok.access_token;
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API ${res.status}`);
  return (await res.json()) as T;
}

/** Runs `fn` over `items`, `width` at a time, stopping early once `deadline` passes. */
async function pool<T>(items: T[], width: number, deadline: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const worker = async () => {
    while (i < items.length && Date.now() < deadline) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: width }, worker));
  return i;
}

export type SyncResult = { status: 'ok' | 'reconnect' | 'not_connected' | 'error'; added: number; checked: number };

/**
 * Reads new bank emails for one user and records their transactions. The first run looks back 90 days;
 * later runs start two days before the newest email already read. Oldest first, so a run cut short by the
 * deadline picks up where it stopped.
 */
export async function syncGmail(phone: string, deadline: number): Promise<SyncResult> {
  const runStart = Date.now();
  const ref = links().doc(phone);
  const snap = await ref.get();
  const link = snap.data();
  if (!snap.exists || !link || link.status !== 'connected') return { status: snap.exists ? 'reconnect' : 'not_connected', added: 0, checked: 0 };

  try {
    const token = await accessToken(open(link.token));
    if (token === 'revoked') {
      await ref.update({ status: 'reconnect', lastError: 'Gmail access was removed. Connect Gmail again.' });
      return { status: 'reconnect', added: 0, checked: 0 };
    }

    const afterSec = link.syncedThrough ? Number(link.syncedThrough) / 1000 - OVERLAP_SEC : (Date.now() - BACKFILL_DAYS * DAY_MS) / 1000;
    const q = bankQuery(BANK_DOMAINS, afterSec);
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(
        token,
        `/messages?q=${encodeURIComponent(q)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`,
      );
      ids.push(...(page.messages || []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < 2000);

    // Gmail lists newest first; read oldest first.
    const batch = ids.reverse().slice(0, MAX_MESSAGES_PER_RUN);
    let added = 0;
    let newest = Number(link.syncedThrough || 0);
    const done = await pool(batch, 5, deadline, async (id) => {
      const msg = await gmail<GmailMessage>(token, `/messages/${id}?format=full`);
      const at = Number(msg.internalDate || Date.now());
      newest = Math.max(newest, at);
      const window = alertWindow(messageText(msg).text);
      const tx = window ? parseTransactionSms(window) : null;
      if (!tx) return;
      const outcome = await recordTransaction(phone, tx, { source: 'gmail', dedupText: `gmail:${id}`, date: tx.date || istDate(at) });
      if (outcome === 'added') added++;
    });

    // Everything up to this run's start was read, or only up to the newest email reached before stopping.
    const finished = ids.length <= MAX_MESSAGES_PER_RUN && done === batch.length;
    await ref.update({
      lastSyncAt: Date.now(),
      syncedThrough: finished ? runStart : newest || link.syncedThrough || null,
      added: FieldValue.increment(added),
      lastError: null,
    });
    return { status: 'ok', added, checked: done };
  } catch (e) {
    const message = (e as Error).message;
    console.warn('Gmail sync failed for a user:', message);
    await ref.update({ lastSyncAt: Date.now(), lastError: 'Could not check Gmail just now. It will try again shortly.' }).catch(() => {});
    return { status: 'error', added: 0, checked: 0 };
  }
}

/** Every connected user, least recently checked first, within the time budget. */
export async function syncAll(deadline: number) {
  const snap = await links().where('status', '==', 'connected').get();
  const users = snap.docs
    .map((d) => ({ phone: d.id, last: Number(d.data().lastSyncAt || 0) }))
    .sort((a, b) => a.last - b.last);
  const results: Record<string, SyncResult['status']> = {};
  for (const u of users) {
    if (Date.now() > deadline - 5000) break;
    results[u.phone.slice(-4)] = (await syncGmail(u.phone, deadline)).status;
  }
  return { users: users.length, checked: Object.keys(results).length };
}
