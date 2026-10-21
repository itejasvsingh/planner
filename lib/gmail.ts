import { randomBytes } from 'node:crypto';
import { db, FieldValue } from './firebase';
import { open, seal } from './secretBox';
import { BANKS, normalizeSender, sendersFor } from './bankSenders';
import { bankQuery, billQuery, messageText, pdfAttachments, statementPdfQuery, type GmailMessage } from './gmailMessage';
import { isLockedPdf, readStatement } from './statementFile';
import { kindFromPdf } from './statementParse';
import { importStatementRows, passwordVersion, statementKind, statementMonthsOf, statementSince, statementSlot, type StatementPassword, type StatementState } from './statementAuto';
import { isCardPaymentReceived, parseBankEmail, parseCardBill } from './emailAlert';
import { bankForSender, ensureBillTask, markBillsPaid, saveBill } from './cardBills';
import { accountLast4, availableBalance, cardPaymentAmount, creditCardOf } from './accountParse';
import { isClosedCard, recordCardPayment, saveBalance, saveStatementRecord } from './moneyAccounts';
import { istParts, recordTransaction } from './recordTransaction';

/**
 * Connected Gmail (read-only). The user grants access once; Align keeps the refresh token encrypted in
 * `gmail_links/<phone>` (server-only) and reads only emails from bank senders, turning alerts into
 * transactions. Email content is not stored and never goes to AI (see /privacy).
 */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'https://alignplanner.vercel.app/api/gmail/callback';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const STATE_TTL_MS = 10 * 60 * 1000;
const BACKFILL_DAYS = 90;
const OVERLAP_SEC = 2 * 24 * 3600; // re-read the last two days each run; recording is idempotent
// Google projects created after May 2026 get 6,000 Gmail quota units per user per minute, and reading a
// message costs 20 (Google also throttles below that in practice). One read about every half second is
// ~2,400 units a minute; a long backfill continues over the next checks.
const MAX_MESSAGES_PER_RUN = 80;
/** Kept in every check for card bills and statement PDFs (emails, and time before the deadline). */
const STATEMENT_RESERVE = 12;
const STATEMENT_TIME = 25_000;
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

export function oauthClient() {
  const id = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const secret = cleanEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  if (!id || !secret) throw new GmailConfigError('Gmail sign-in is not set up yet (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).');
  if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) {
    throw new GmailConfigError('GOOGLE_OAUTH_CLIENT_ID in Vercel doesn’t look like a Google client ID (it should end in .apps.googleusercontent.com).');
  }
  return { id, secret };
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

export type SyncResult = { status: 'ok' | 'reconnect' | 'not_connected' | 'error'; added: number; checked: number; bills?: number; message?: string };

/** What the user (the app's owner, for setup problems) can do about a failed check. */
export function explain(message: string) {
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
/** `opts.statements`: how many statement PDFs to open this time (2 by default; more when you ask to find them). */
export async function syncGmail(phone: string, deadline: number, opts: { statements?: number } = {}): Promise<SyncResult> {
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
    let billsFound = 0;
    const readIds = new Set<string>();
    const withPdf = new Map<string, GmailMessage>();
    const todayKey = istParts(Date.now()).date;

    /** A bill or statement email: keep it, and make its reminder task if the user said yes. */
    const takeBill = async (text: string, from: string, at?: number) => {
      const bill = parseCardBill(text);
      if (!bill) return false;
      // A card the user closed: its bills aren't kept
      const issuer = bankForSender(from)?.id || from.split('@').pop() || 'card';
      if (isClosedCard(link, issuer, bill.last4)) return true;
      const stored = await saveBill(phone, bill, from, at);
      billsFound++;
      if (link.billReminders === true && stored.dueDate >= todayKey) await ensureBillTask(phone, stored);
      return true;
    };
    let checked = 0;
    let throttled = false;

    /** `max`: at most this many emails; `until`: stop by then (alerts leave room for bills and statements). */
    const read = async (ids: string[], lim: { max?: number; until?: number } = {}) => {
      const batch = ids.slice(0, Math.min(budget, lim.max ?? budget));
      const dates = new Array<number>(batch.length).fill(0);
      const result = await pool(batch, READ_WIDTH, lim.until ?? deadline, async (id) => {
        const msg = await gmail<GmailMessage>(token, `/messages/${id}?format=full`);
        const at = Number(msg.internalDate || Date.now());
        dates[batch.indexOf(id)] = at;
        readIds.add(id);
        // Statements are opened in step 4: keep emails with a PDF so they aren't downloaded twice
        if (pdfAttachments(msg).length) withPdf.set(id, msg);
        const { text, from } = messageText(msg);
        // Paying the card bill isn't income (the card spends were already counted): close the reminder instead.
        const bank = bankForSender(from);
        if (isCardPaymentReceived(text)) {
          if (bank) {
            await markBillsPaid(phone, bank.id);
            const paid = cardPaymentAmount(text);
            if (paid) await recordCardPayment(phone, bank.id, paid, at);
          }
          return;
        }
        // The balance an alert quotes, kept as the account's latest balance (only the number)
        const bal = availableBalance(text);
        if (bal && bank) await saveBalance(phone, { bankId: bank.id, bankName: bank.name, last4: bal.last4, balance: bal.balance, at });
        const tx = parseBankEmail(text);
        if (!tx) {
          await takeBill(text, from, at);
          return;
        }
        const arrived = istParts(at);
        const outcome = await recordTransaction(phone, tx, { source: 'gmail', dedupText: `gmail:${id}`, date: tx.date || arrived.date, time: arrived.time, card: creditCardOf(text), account: accountLast4(text), text });
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
    // Only the banks and cards this person chose (all of them until they choose)
    const senders = sendersFor(link.banks, link.extraSenders);
    // Statements and bills come from every bank and card company Align knows, ticked or not (alerts stay ticked-only)
    const statementSenders = sendersFor(null, link.extraSenders);
    // Only the last 3 months of statements, unless the user asked for more
    const statementAfter = statementSince(statementMonthsOf(link)) / 1000;

    // Time kept for bills and statements: 25 s, or 40% of a shorter check
    const alertsUntil = deadline - Math.min(STATEMENT_TIME, (deadline - Date.now()) * 0.4);

    // 1. New since the last check, oldest first.
    const fresh = await list(bankQuery(senders, { after: Number(link.syncedThrough) / 1000 - OVERLAP_SEC }), 1000);
    const forward = await read(fresh.ids.reverse(), { max: budget - STATEMENT_RESERVE, until: alertsUntil });
    patch.syncedThrough = forward.all && fresh.complete ? runStart : Math.max(Number(link.syncedThrough), ...forward.dates);

    // 2. History, newest first.
    let backfillUntil: number | null = link.backfillUntil ? Number(link.backfillUntil) : null;
    // Older alerts never use the room kept for bills and statements, or they'd wait until the whole history is read
    if (backfillUntil && budget > STATEMENT_RESERVE && !throttled && Date.now() < alertsUntil) {
      const old = await list(bankQuery(senders, { after: Number(link.backfillFrom) / 1000, before: backfillUntil / 1000 }), budget - STATEMENT_RESERVE);
      const back = await read(old.ids, { max: budget - STATEMENT_RESERVE, until: alertsUntil });
      if (back.all && old.complete) backfillUntil = null;
      // Re-reads the oldest email of this run next time (same second), which is harmless.
      else if (back.dates.length) backfillUntil = Math.min(...back.dates) + 1000;
    }
    patch.backfillUntil = backfillUntil;

    // 3. Card bills and statements the alert search didn't bring in (last ~3 months, a few per check).
    if (budget > 0 && !throttled && Date.now() < deadline) {
      const seen = new Set<string>([...(link.billMsgIds || []), ...readIds]);
      const found = await list(billQuery(statementSenders, statementAfter), 30);
      const todo = found.ids.filter((id) => !seen.has(id)).slice(0, Math.min(5, budget));
      const res = await pool(todo, READ_WIDTH, deadline, async (id) => {
        const msg = await gmail<GmailMessage>(token, `/messages/${id}?format=full`);
        const { text, from } = messageText(msg);
        await takeBill(text, from, Number(msg.internalDate || Date.now()));
      });
      budget -= res.done;
      throttled = throttled || res.throttled;
      patch.billMsgIds = [...todo.slice(0, res.done), ...(link.billMsgIds || [])].slice(0, 100);
    }

    // 4. Statement PDFs (last ~3 months, at most two per check), opened with the password the user saved for
    //    that bank. A file that needs a password is tried again only after its bank's password changes.
    if (budget > 0 && !throttled && Date.now() < deadline - 10_000) {
      const done = new Set<string>(link.statementMsgIds || []);
      // Statements read before bills were taken from the PDF itself are opened once more, only for the bill
      const billIds = new Set<string>(link.statementBillIds2 || []);
      // Card or account, as the opened PDF says: corrects the list in Settings → Gmail
      const kindOf = new Map<string, 'account' | 'card'>();
      const tried: Record<string, { bank: string; v: number }> = { ...(link.statementTried || {}) };
      const passwords: Record<string, StatementPassword> = link.statementPasswords || {};
      const status: Record<string, StatementState> = {};
      const found = await list(statementPdfQuery(statementSenders, statementAfter), 100);
      const todo = found.ids
        .filter((id) => (!done.has(id) || !billIds.has(id)) && !(tried[id] && passwordVersion(passwords, tried[id].bank.replace(/__card$/, '')) === tried[id].v))
        .slice(0, Math.min(opts.statements ?? 2, budget));
      for (const id of todo) {
        if (Date.now() > deadline - 8_000) break;
        // Already read this run and it had no PDF: nothing to open
        if (readIds.has(id) && !withPdf.has(id)) { done.add(id); billIds.add(id); continue; }
        try {
          let msg = withPdf.get(id);
          if (!msg) {
            msg = await gmail<GmailMessage>(token, `/messages/${id}?format=full`);
            budget--;
          }
          const { text, subject, from } = messageText(msg);
          const bank = bankForSender(from);
          const pdf = pdfAttachments(msg).find((a) => a.size <= 5_000_000);
          if (!bank || !pdf) { done.add(id); billIds.add(id); continue; }
          const data = pdf.data || (await gmail<{ data: string }>(token, `/messages/${id}/attachments/${pdf.attachmentId}`)).data;
          const buf = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
          // Card or account statement: each has its own password (the other is tried too, in case it was
          // saved in the wrong place)
          const emailCard = statementKind(bank.id, subject, text) === 'card';
          const pw = passwords[statementSlot(bank.id, emailCard ? 'card' : 'account')];
          const otherPw = passwords[statementSlot(bank.id, emailCard ? 'account' : 'card')];
          let res = await readStatement(buf);
          const locked = res.status === 'password';
          let opener: string | null = null;
          if (res.status === 'password' && pw) { res = await readStatement(buf, open(pw.sealed)); if (res.status !== 'password') opener = statementSlot(bank.id, emailCard ? 'card' : 'account'); }
          if (res.status === 'password' && otherPw) { res = await readStatement(buf, open(otherPw.sealed)); if (res.status !== 'password') opener = statementSlot(bank.id, emailCard ? 'account' : 'card'); }
          // The password that opened it is now known to work
          if (opener && !passwords[opener]?.verified) patch[`statementPasswords.${opener}.verified`] = true;
          const at = Number(msg.internalDate || Date.now());
          // Once open, the statement itself says whether it is a card or an account statement (and which one), which
          // beats the email's wording; a locked file can only go by the email
          const pdfKind = 'text' in res && res.text ? kindFromPdf(res.text) : null;
          const creditCard = pdfKind ? pdfKind === 'card' : emailCard;
          if (pdfKind) kindOf.set(id, pdfKind);
          const slot = statementSlot(bank.id, creditCard ? 'card' : 'account');
          const pdfText = 'text' in res && res.text ? res.text : '';
          // The card or account number printed in the statement, not whatever the email mentions
          const last4 = creditCard
            ? creditCardOf(pdfText)?.last4 || creditCardOf(text)?.last4 || null
            : accountLast4(pdfText) || accountLast4(text) || null;
          // A card the user closed: nothing more is read from its statements (and no password is asked for)
          if (creditCard && isClosedCard(link, bank.id, last4 || creditCardOf(text)?.last4 || null)) { done.add(id); billIds.add(id); delete tried[id]; continue; }
          // The statement's own summary (total due, minimum, due date, card) is the bill: banks like HDFC keep these
          // out of the email text. Read even when the transaction table couldn't be.
          // The bill as the statement states it (null: a card statement where no due date and amount were found)
          const bill = creditCard && pdfText ? parseCardBill(`${pdfText}\n${text}`) : null;
          if (bill) await takeBill(`${pdfText}\n${text}`, from, at);
          const billFields = creditCard && res.status !== 'password'
            ? { billFound: !!bill, bill: bill ? { totalDue: bill.totalDue, minDue: bill.minDue, dueDate: bill.dueDate } : null }
            : {};
          const product = creditCard ? bill?.product || null : null;
          // Only the bill was wanted from a statement that was already imported
          if (done.has(id)) {
            if (res.status !== 'password') billIds.add(id);
            // Read before Wallet kept a record of each statement: add it now (its transactions are already in)
            if (res.status === 'ok' && res.rows.length) {
              const dates = res.rows.map((r) => r.date).sort();
              await saveStatementRecord(phone, { id, bankId: bank.id, bankName: bank.name, kind: creditCard ? 'card' : 'account', last4, product, state: 'ok', from: dates[0], to: dates[dates.length - 1], rows: res.rows.length, added: 0, at, ...billFields });
            }
            continue;
          }
          billIds.add(id);
          if (res.status === 'ok') {
            const r = await importStatementRows(phone, res.rows, { bankId: bank.id, bankName: bank.name, at, creditCard, last4, deadline: deadline - 3_000 });
            added += r.added;
            if (!r.complete) break; // out of time: this statement continues next check
            status[slot] = { state: 'ok', at, msgId: id, foundAt: Date.now(), locked, added: r.added, rows: r.rows, from: r.from, to: r.to, checked: r.checked, extras: r.extras };
            await saveStatementRecord(phone, { id, bankId: bank.id, bankName: bank.name, kind: creditCard ? 'card' : 'account', last4, product, state: 'ok', from: r.from || null, to: r.to || null, rows: r.rows, added: r.added, at, ...billFields });
            done.add(id);
            delete tried[id];
          } else if (res.status === 'password') {
            status[slot] = { state: pw ? 'wrong_password' : 'needs_password', at, msgId: id, foundAt: Date.now() };
            tried[id] = { bank: slot, v: passwordVersion(passwords, bank.id) };
          } else {
            status[slot] = { state: 'unreadable', at, msgId: id, foundAt: Date.now() };
            await saveStatementRecord(phone, { id, bankId: bank.id, bankName: bank.name, kind: creditCard ? 'card' : 'account', last4, product, state: 'unreadable', at, ...billFields });
            done.add(id);
          }
        } catch (e) {
          if (e instanceof GmailThrottled) { throttled = true; break; }
          console.warn('Statement PDF skipped:', (e as Error).message);
          done.add(id);
          billIds.add(id);
        }
      }
      patch.statementMsgIds = [...done].slice(-200);
      patch.statementBillIds2 = [...billIds].slice(-200);
      const index = (link.statementIndex || []) as FoundStatement[];
      if (kindOf.size && index.some((x) => kindOf.has(x.id) && kindOf.get(x.id) !== x.kind)) {
        patch.statementIndex = index.map((x) => (kindOf.has(x.id) ? { ...x, kind: kindOf.get(x.id)! } : x));
      }
      patch.statementTried = tried;
      for (const [b, st] of Object.entries(status)) patch[`statementStatus.${b}`] = st;
    }

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
    // Saved passwords not yet proven: try them on a statement (a few per check)
    if (Date.now() < deadline - 12_000) await verifySavedPasswords(phone).catch(() => 0);
    return { status: 'ok', added, checked, bills: billsFound, ...(message ? { message } : {}) };
  } catch (e) {
    const message = (e as Error).message;
    console.warn('Gmail sync failed for a user:', message);
    const explained = explain(message);
    await ref.update({ lastSyncAt: Date.now(), lastError: explained, syncingSince: null }).catch(() => {});
    return { status: 'error', added: 0, checked: 0, message: explained };
  }
}

// ---------------------------------------------------------------- which banks to read

const DETECT_DAYS = 180;
const MAX_EXTRA_SENDERS = 10;

export async function bankChoices(phone: string) {
  const d = (await links().doc(phone).get()).data();
  return {
    banks: BANKS.map(({ id, name }) => ({ id, name })),
    selected: Array.isArray(d?.banks) ? (d!.banks as string[]) : null,
    detected: Array.isArray(d?.detectedBanks) ? (d!.detectedBanks as string[]) : null,
    extra: Array.isArray(d?.extraSenders) ? (d!.extraSenders as string[]) : [],
  };
}

// Bank detection: searches only (5 quota units each, nothing is read), so several can run at once.
const DETECT_GROUP = 8;
const DETECT_WIDTH = 6;

/** `fn` over `items`, `width` at a time, results in the same order. */
async function mapLimit<T, R>(items: T[], width: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return out;
}

/**
 * Which listed banks have sent this person a transaction email in the last six months, in two parallel
 * rounds: banks searched in groups of eight first (most groups have no hits and are ruled out at once), then
 * one search per bank only inside the groups that did. About a dozen searches instead of one per bank.
 */
export async function detectBanks(phone: string, deadline: number): Promise<string[] | null> {
  const ref = links().doc(phone);
  const link = (await ref.get()).data();
  if (!link || link.status !== 'connected') return null;
  const token = await accessToken(open(link.token));
  if (token === 'revoked') {
    await ref.update({ status: 'reconnect', lastError: 'Gmail access was removed. Connect Gmail again.' });
    return null;
  }
  const after = (Date.now() - DETECT_DAYS * DAY_MS) / 1000;
  const any = async (senders: string[]) => {
    if (Date.now() > deadline) return false;
    const page = await gmail<{ messages?: unknown[] }>(
      token,
      `/messages?q=${encodeURIComponent(bankQuery(senders, { after }))}&maxResults=1&fields=messages(id)`,
    );
    return !!page.messages?.length;
  };

  // "Any other .bank.in bank" matches every .bank.in address (slice's too), so it's never "found".
  const banks = BANKS.filter((b) => b.id !== 'otherbankin');
  const groups: (typeof banks)[] = [];
  for (let i = 0; i < banks.length; i += DETECT_GROUP) groups.push(banks.slice(i, i + DETECT_GROUP));

  let found: string[] = [];
  try {
    const groupHit = await mapLimit(groups, DETECT_WIDTH, (g) => any(g.flatMap((b) => b.senders)));
    const candidates = groups.filter((_, i) => groupHit[i]).flat();
    const bankHit = await mapLimit(candidates, DETECT_WIDTH, (b) => any(b.senders));
    found = candidates.filter((_, i) => bankHit[i]).map((b) => b.id);
  } catch (e) {
    if (!(e instanceof GmailThrottled)) throw e;
    // Gmail asked to slow down: keep what was already known rather than nothing.
    found = Array.isArray(link.detectedBanks) ? link.detectedBanks : [];
  }
  await ref.update({ detectedBanks: found });
  return found;
}

/**
 * Saves the banks/cards to read and any extra sender addresses. Adding a bank (or an address) after the
 * history was read re-reads the last 90 days once so its older emails are included; dedupe keeps that safe.
 */
export async function saveBankChoices(phone: string, banks: unknown, extra: unknown) {
  const ids = Array.isArray(banks) ? [...new Set(banks.map(String).filter((id) => BANKS.some((b) => b.id === id)))] : [];
  const senders = Array.isArray(extra) ? [...new Set(extra.map((x) => normalizeSender(String(x))).filter((x): x is string => !!x))].slice(0, MAX_EXTRA_SENDERS) : [];
  const ref = links().doc(phone);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const link = snap.data();
    if (!snap.exists || !link) return { ok: false as const };
    const before = new Set(sendersFor(link.banks, link.extraSenders));
    const added = sendersFor(ids, senders).some((s) => !before.has(s));
    const patch: Record<string, unknown> = { banks: ids, extraSenders: senders };
    if (added && link.syncedThrough) {
      patch.backfillFrom = Date.now() - BACKFILL_DAYS * DAY_MS;
      patch.backfillUntil = (Math.floor(Number(link.syncedThrough) / 1000) - OVERLAP_SEC) * 1000;
    }
    t.update(ref, patch);
    return { ok: true as const, banks: ids, extra: senders, rereading: added };
  });
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

/** Bump when how statements are sorted (account vs card) changes: they're checked again. */
const INDEX_VERSION = 3;

export type FoundStatement = {
  id: string;
  bankId: string;
  bankName: string;
  kind: 'account' | 'card';
  date: number;
  /** The PDF asks for a password; null until Align has checked it. */
  locked: boolean | null;
};

/**
 * Statement PDFs from your banks in the chosen window (last 3 months by default) (every bank Align knows, so ones you haven't
 * ticked show up too). Each new one is opened just far enough to see whether it needs a password; the
 * answer is remembered (gmail_links.statementIndex), so later searches only check new emails.
 */
export async function findStatements(phone: string, deadline = Date.now() + 40_000): Promise<{ status: 'ok' | 'not_connected' | 'reconnect'; statements: FoundStatement[] }> {
  const ref = links().doc(phone);
  const link = (await ref.get()).data();
  if (!link) return { status: 'not_connected', statements: [] };
  if (link.status !== 'connected') return { status: 'reconnect', statements: [] };
  const token = await accessToken(open(link.token));
  if (token === 'revoked') return { status: 'reconnect', statements: [] };
  const senders = sendersFor(null, link.extraSenders);
  const after = statementSince(statementMonthsOf(link)) / 1000;
  const found = ((await gmail<{ messages?: { id: string }[] }>(token, `/messages?q=${encodeURIComponent(statementPdfQuery(senders, after))}&maxResults=100`)).messages || []).map((m) => m.id);
  // Remembered answers, unless they came from an older way of sorting account vs card statements
  const known = new Map<string, FoundStatement>(link.statementIndexVersion === INDEX_VERSION ? ((link.statementIndex || []) as FoundStatement[]).map((x) => [x.id, x]) : []);
  const out: FoundStatement[] = [];
  await pool(found, READ_WIDTH, deadline, async (id) => {
    const prev = known.get(id);
    if (prev && prev.locked !== null) { out.push(prev); return; }
    const msg = await gmail<GmailMessage>(token, `/messages/${id}?format=full`);
    const { subject, text, from } = messageText(msg);
    const bank = bankForSender(from);
    const pdf = pdfAttachments(msg).find((x) => x.size <= 5_000_000);
    if (!bank || !pdf) return; // not a bank statement PDF
    let kind = statementKind(bank.id, subject, text);
    let locked: boolean | null = null;
    try {
      const data = pdf.data || (await gmail<{ data: string }>(token, `/messages/${id}/attachments/${pdf.attachmentId}`)).data;
      const buf = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      locked = await isLockedPdf(buf);
      // An open PDF says itself whether it's a card or an account statement
      if (locked === false) {
        const res = await readStatement(buf);
        const pdfKind = 'text' in res && res.text ? kindFromPdf(res.text) : null;
        if (pdfKind) kind = pdfKind;
      }
    } catch (e) {
      if (e instanceof GmailThrottled) throw e;
    }
    out.push({ id, bankId: bank.id, bankName: bank.name, kind, date: Number(msg.internalDate || 0), locked });
  });
  const statements = out.sort((a, b) => b.date - a.date);
  // Remember what was learned (newest 100), including statements this search didn't get to
  const merged = new Map<string, FoundStatement>([...known.entries(), ...statements.map((x) => [x.id, x] as const)]);
  await ref.update({ statementIndex: [...merged.values()].sort((a, b) => b.date - a.date).slice(0, 100), statementIndexVersion: INDEX_VERSION, statementIndexAt: Date.now() });
  return { status: 'ok', statements };
}

/**
 * Tries a statement password on the newest locked statement of that bank and kind before it's saved, so a typo is
 * caught straight away. 'unknown' when there's nothing to try it on (or Gmail can't be reached): it's saved as before.
 */
export async function checkStatementPassword(phone: string, bankId: string, kind: 'account' | 'card', password: string): Promise<'ok' | 'wrong' | 'unknown'> {
  try {
    const link = (await links().doc(phone).get()).data();
    if (!link || link.status !== 'connected') return 'unknown';
    const token = await accessToken(open(link.token));
    if (token === 'revoked') return 'unknown';
    const pdfOf = async (id: string) => {
      const msg = await gmail<GmailMessage>(token, `/messages/${id}?format=full`);
      const pdf = pdfAttachments(msg).find((a) => a.size <= 5_000_000);
      if (!pdf) return null;
      const data = pdf.data || (await gmail<{ data: string }>(token, `/messages/${id}/attachments/${pdf.attachmentId}`)).data;
      return { msg, buf: Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64') };
    };
    // A locked statement of this bank and kind: from the list Align keeps, else searched for in Gmail now
    let target: Buffer | null = null;
    const known = ((link.statementIndex || []) as FoundStatement[])
      .filter((x) => x.bankId === bankId && x.kind === kind && x.locked === true)
      .sort((a, b) => b.date - a.date)[0];
    if (known) target = (await pdfOf(known.id))?.buf || null;
    if (!target) {
      const bank = BANKS.find((b) => b.id === bankId);
      const domains = bank ? bank.senders : sendersFor(null, link.extraSenders).filter((d) => bankForSender(`x@${d}`)?.id === bankId);
      if (!domains.length) return 'unknown';
      const q = statementPdfQuery(domains, statementSince(12) / 1000);
      const ids = ((await gmail<{ messages?: { id: string }[] }>(token, `/messages?q=${encodeURIComponent(q)}&maxResults=8`)).messages || []).map((m) => m.id);
      for (const id of ids) {
        const got = await pdfOf(id);
        if (!got || (await isLockedPdf(got.buf)) !== true) continue;
        const { subject, text } = messageText(got.msg);
        if (statementKind(bankId, subject, text) !== kind) continue;
        target = got.buf;
        break;
      }
    }
    if (!target) return 'unknown';
    const res = await readStatement(target, password);
    return res.status === 'password' ? 'wrong' : 'ok';
  } catch {
    return 'unknown';
  }
}

/**
 * Saved statement passwords that haven't been proven yet (saved before passwords were checked, or with no statement to
 * try then) are tried on the bank's latest locked statement: verified when it opens, "wrong password" when it doesn't.
 * Each is tried at most every 6 hours; a few per call.
 */
export async function verifySavedPasswords(phone: string, max = 2): Promise<number> {
  const ref = links().doc(phone);
  const link = (await ref.get()).data();
  if (!link || link.status !== 'connected') return 0;
  const passwords = (link.statementPasswords || {}) as Record<string, StatementPassword & { checkedAt?: number }>;
  const todo = Object.entries(passwords)
    .filter(([, p]) => p && !p.verified && !(p.checkedAt && Date.now() - p.checkedAt < 6 * 3600_000))
    .slice(0, max);
  let done = 0;
  for (const [slot, p] of todo) {
    const kind = slot.endsWith('__card') ? 'card' : 'account';
    const bankId = slot.replace(/__card$/, '');
    const result = await checkStatementPassword(phone, bankId, kind, open(p.sealed));
    const patch: Record<string, unknown> = { [`statementPasswords.${slot}.checkedAt`]: Date.now() };
    if (result === 'ok') patch[`statementPasswords.${slot}.verified`] = true;
    if (result === 'wrong') patch[`statementStatus.${slot}`] = { state: 'wrong_password', at: Date.now() } satisfies StatementState;
    await ref.update(patch);
    done++;
  }
  return done;
}
