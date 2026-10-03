import { randomBytes } from 'node:crypto';
import { db, FieldValue } from './firebase';
import { open, seal } from './secretBox';
import { BANK_DOMAINS } from './bankSenders';
import { bankQuery, messageText, type GmailMessage } from './gmailMessage';
import { parseBankEmail } from './emailAlert';
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
// Google projects created after May 2026 get 6,000 Gmail quota units per user per minute, and reading a
// message costs 20 (Google also throttles below that in practice). One read about every half second is
// ~2,400 units a minute; a long backfill continues over the next checks.
const MAX_MESSAGES_PER_RUN = 80;
const READ_WIDTH = 1;
const READ_PAUSE_MS = 450;
// Checks for one user don't overlap (app open, "Check now" and the 15-minute job share the quota).
const RUN_LOCK_MS = 90 * 1000;
const DAY_MS = 86400000;

const links = () => db.collection('gmail_links');
const states = () => db.collection('gmail_oauth_states');

export type ReturnTo = 'web' | 'app';

// Pasted values often carry spaces, line breaks or quotes, which Google reports as "OAuth client was not found".
const cleanEnv = (v?: string) => String(v || '').trim().replace(/^["']|["']$/g, '').trim();

export class GmailConfigError extends Error {}

function oauthClient() {
  const id = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const secret = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  if (!id || !secret) throw new GmailConfigError('Gmail sign-in is not set up yet (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).');
  if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) {
    throw new GmailConfigError('GOOGLE_OAUTH_CLIENT_ID in Vercel doesn’t look like a Google client ID (it should end in .apps.googleusercontent.com).');
  }
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

/** Gmail asked us to slow down (it answers 429, or 403 with a quota/rate reason). */
export class GmailThrottled extends Error {}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message || '';
    if (res.status === 429 || (res.status === 403 && /quota|rate ?limit|too many/i.test(detail))) throw new GmailThrottled(detail);
    throw new Error(`Gmail API ${res.status}: ${detail}`.slice(0, 300));
  }
  return (await res.json()) as T;
}

/**
 * Runs `fn` over `items` in order, `width` at a time with a pause between calls, stopping early once
 * `deadline` passes or Gmail asks to slow down. Returns how many items were completed, in order: items
 * after the first unfinished one are not counted even if they ran.
 */
async function pool<T>(items: T[], width: number, deadline: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  let stop = false;
  const ok = new Array<boolean>(items.length).fill(false);
  const worker = async () => {
    while (!stop && next < items.length && Date.now() < deadline) {
      const i = next++;
      try {
        await fn(items[i]);
        ok[i] = true;
      } catch (e) {
        if (e instanceof GmailThrottled) stop = true;
        else throw e;
      }
      await new Promise((r) => setTimeout(r, READ_PAUSE_MS));
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
  const done = ok.indexOf(false);
  return { done: done === -1 ? items.length : done, throttled: stop };
}

export type SyncResult = { status: 'ok' | 'reconnect' | 'not_connected' | 'error'; added: number; checked: number; message?: string };

/** What the user (the app's owner, for setup problems) can do about a failed check. */
function explain(message: string) {
  if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(message)) {
    return 'The Gmail API is switched off for Align. In Google Cloud (planner-app): APIs & Services → Library → Gmail API → Enable, then tap Check now.';
  }
  if (/quota|rate ?limit/i.test(message)) return 'Gmail asked Align to slow down. The next check (within 15 minutes) continues.';
  if (/insufficient|PERMISSION_DENIED|403/i.test(message) && /Gmail API/.test(message)) {
    const google = message.replace(/^Gmail API \d+:\s*/, '').slice(0, 160);
    return `Google didn’t give Align permission to read Gmail. Disconnect, then connect again and leave the Gmail box ticked. (Google says: ${google || 'permission denied'})`;
  }
  if (/token refresh failed/i.test(message)) return 'Google refused Align’s access key. Disconnect and connect Gmail again.';
  if (/requires an index|FAILED_PRECONDITION/i.test(message)) return 'Align’s database needs a setup change before it can save Gmail transactions.';
  return `Could not check Gmail just now (${message.slice(0, 120)}). It will try again shortly.`;
}

/** Bump when alert parsing improves: the next check re-reads the last 90 days once (recording is idempotent). */
const PARSER_VERSION = 3;

/**
 * Reads bank alert emails for one user and records their transactions, within Gmail's per-minute quota:
 * 1. new emails since the last check (oldest first), every time;
 * 2. the 90-day history, newest first, so recent transactions appear at once; it continues over the next
 *    checks until it reaches 90 days back.
 * Progress only moves past an unbroken run of emails that were read, so a check cut short (deadline or
 * Gmail asking to slow down) loses nothing.
 */
export async function syncGmail(phone: string, deadline: number): Promise<SyncResult> {
  const runStart = Date.now();
  const ref = links().doc(phone);
  const claim = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const link = snap.data();
    if (!snap.exists || !link) return { state: 'not_connected' as const };
    if (link.status !== 'connected') return { state: 'reconnect' as const };
    if (Number(link.syncingSince || 0) > runStart - RUN_LOCK_MS) return { state: 'busy' as const };
    const patch: Record<string, unknown> = { syncingSince: runStart };
    if (link.parserVersion !== PARSER_VERSION) {
      // First check, or parsing improved: (re)read the last 90 days, newest first.
      patch.parserVersion = PARSER_VERSION;
      patch.syncedThrough = link.syncedThrough || runStart;
      // The "new emails" pass covers the last two days before the cursor; history covers the rest.
      // Same whole second the "new" pass starts from (Gmail: after: is inclusive, before: exclusive).
      patch.backfillUntil = (Math.floor(Number(link.syncedThrough || runStart) / 1000) - OVERLAP_SEC) * 1000;
      patch.backfillFrom = runStart - BACKFILL_DAYS * DAY_MS;
    }
    t.update(ref, patch);
    return { state: 'go' as const, link: { ...link, ...patch } };
  });
  if (claim.state === 'not_connected' || claim.state === 'reconnect') return { status: claim.state, added: 0, checked: 0 };
  if (claim.state === 'busy') return { status: 'ok', added: 0, checked: 0, message: 'Already checking Gmail. New transactions will appear in a minute.' };
  const link = claim.link as Record<string, any>;

  try {
    const token = await accessToken(open(link.token));
    if (token === 'revoked') {
      await ref.update({ status: 'reconnect', lastError: 'Gmail access was removed. Connect Gmail again.', syncingSince: null });
      return { status: 'reconnect', added: 0, checked: 0 };
    }

    let budget = MAX_MESSAGES_PER_RUN;
    let added = 0;
    let checked = 0;
    let throttled = false;

    const read = async (ids: string[]) => {
      const batch = ids.slice(0, budget);
      const dates = new Array<number>(batch.length).fill(0);
      const result = await pool(batch, READ_WIDTH, deadline, async (id) => {
        const msg = await gmail<GmailMessage>(token, `/messages/${id}?format=full`);
        const at = Number(msg.internalDate || Date.now());
        dates[batch.indexOf(id)] = at;
        const tx = parseBankEmail(messageText(msg).text);
        if (!tx) return;
        const outcome = await recordTransaction(phone, tx, { source: 'gmail', dedupText: `gmail:${id}`, date: tx.date || istDate(at) });
        if (outcome === 'added') added++;
      });
      budget -= result.done;
      checked += result.done;
      throttled = throttled || result.throttled;
      return { done: result.done, all: result.done === ids.length, dates: dates.slice(0, result.done) };
    };

    const list = async (q: string, max: number) => {
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(
          token,
          `/messages?q=${encodeURIComponent(q)}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`,
        );
        ids.push(...(page.messages || []).map((m) => m.id));
        pageToken = page.nextPageToken;
      } while (pageToken && ids.length < max);
      return { ids, complete: !pageToken };
    };

    const patch: Record<string, unknown> = {};

    // 1. New since the last check, oldest first.
    const fresh = await list(bankQuery(BANK_DOMAINS, { after: Number(link.syncedThrough) / 1000 - OVERLAP_SEC }), 1000);
    const forward = await read(fresh.ids.reverse());
    patch.syncedThrough = forward.all && fresh.complete ? runStart : Math.max(Number(link.syncedThrough), ...forward.dates);

    // 2. History, newest first.
    let backfillUntil: number | null = link.backfillUntil ? Number(link.backfillUntil) : null;
    if (backfillUntil && budget > 0 && !throttled && Date.now() < deadline) {
      const old = await list(bankQuery(BANK_DOMAINS, { after: Number(link.backfillFrom) / 1000, before: backfillUntil / 1000 }), budget);
      const back = await read(old.ids);
      if (back.all && old.complete) backfillUntil = null;
      // Re-reads the oldest email of this run next time (same second), which is harmless.
      else if (back.dates.length) backfillUntil = Math.min(...back.dates) + 1000;
    }
    patch.backfillUntil = backfillUntil;

    const notes: string[] = [];
    if (throttled) notes.push('Gmail asked Align to slow down; it continues in the next check.');
    if (backfillUntil) {
      const upTo = new Date(backfillUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
      notes.push(`Still reading older bank emails (done back to ${upTo}); the rest is added over the next checks.`);
    }
    const message = notes.join(' ') || undefined;
    await ref.update({
      ...patch,
      lastSyncAt: Date.now(),
      added: FieldValue.increment(added),
      lastError: throttled ? notes[0] : null,
      syncingSince: null,
    });
    return { status: 'ok', added, checked, ...(message ? { message } : {}) };
  } catch (e) {
    const message = (e as Error).message;
    console.warn('Gmail sync failed for a user:', message);
    const explained = explain(message);
    await ref.update({ lastSyncAt: Date.now(), lastError: explained, syncingSince: null }).catch(() => {});
    return { status: 'error', added: 0, checked: 0, message: explained };
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
