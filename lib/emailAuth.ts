import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { adminAuth, db, FieldValue } from './firebase';
import { consumeRateLimit } from './rateLimit';
import { getPhoneVariants } from './phone';
import { emailConfigured, sendEmail } from './emailSend';
import { isStandIn, mergeAccounts } from './accountLink';

/**
 * Email sign-in, the backup for WhatsApp: a 6-digit code is emailed; the right code returns a Firebase custom token.
 * Everything in Align is keyed by a phone number, so each email gets a stand-in number the first time: `910` and nine
 * digits, a form no real mobile number can have (so it can never collide with, or open, a real person's account).
 * The pairing lives in server-only `email_identities/<hash>` and `email_phones/<phone>`. These accounts have no WhatsApp
 * link (the bot knows people by their real number), but the app, Wallet, Gmail and push work as for anyone.
 * Codes are kept hashed in `auth_codes/em_<hash>` with an expiry and a tries limit, like the WhatsApp codes.
 */
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const HOUR = 60 * 60 * 1000;

export const normalizeEmail = (raw: string) => String(raw || '').trim().toLowerCase();
export const isValidEmail = (e: string) => e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const emailKey = (email: string) => sha(`email:${email}`).slice(0, 32);
const hashCode = (email: string, code: string) => createHash('sha256').update(`${email}:${code}`).digest();

export type EmailStart = { status: 'sent' } | { status: 'error'; message: string; http: number };

export async function startEmailLogin(rawEmail: string, ip: string): Promise<EmailStart> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return { status: 'error', message: 'Enter a valid email address.', http: 400 };
  if (!emailConfigured()) return { status: 'error', message: 'Email sign-in isn’t switched on yet. Use WhatsApp for now.', http: 503 };

  const [byEmail, byIp, overall] = await Promise.all([
    consumeRateLimit(`emailcode_addr_${emailKey(email)}`, 6, HOUR),
    consumeRateLimit(`emailcode_ip_${ip}`, 20, HOUR),
    consumeRateLimit('emailcode_all', 300, 24 * HOUR),
  ]);
  if (!byEmail || !byIp || !overall) return { status: 'error', message: 'Too many codes requested. Try again in an hour.', http: 429 };

  const ref = db.collection('auth_codes').doc(`em_${emailKey(email)}`);
  const prev = await ref.get();
  if (prev.exists && Date.now() - Number(prev.data()?.sentAt || 0) < RESEND_AFTER_MS) {
    return { status: 'error', message: 'A code was just sent. Wait 30 seconds before asking for another.', http: 429 };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await ref.set({ hash: hashCode(email, code).toString('hex'), expiresAt: Date.now() + CODE_TTL_MS, sentAt: Date.now(), attempts: 0 });
  const ok = await sendEmail(email, `Your Align code: ${code}`, `Your Align sign-in code is ${code}.\n\nIt works for 10 minutes. If you didn't ask for it, ignore this email.`);
  if (!ok) return { status: 'error', message: 'Couldn’t send the email right now. Try again shortly.', http: 502 };
  return { status: 'sent' };
}

export type EmailVerify = { status: 'ok'; token: string; phone: string } | { status: 'error'; message: string; http: number };

/** The stand-in number for this email: made on first sign-in, the same every time after. */
async function phoneFor(email: string): Promise<string> {
  const idRef = db.collection('email_identities').doc(emailKey(email));
  return db.runTransaction(async (t) => {
    const existing = await t.get(idRef);
    if (existing.exists) return String(existing.data()!.phone);
    for (let i = 0; i < 20; i++) {
      const phone = `910${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
      const taken = await t.get(db.collection('email_phones').doc(phone));
      if (taken.exists) continue;
      t.set(db.collection('email_phones').doc(phone), { at: FieldValue.serverTimestamp() });
      t.set(idRef, { email, phone, createdAt: FieldValue.serverTimestamp() });
      return phone;
    }
    throw new Error('No free number');
  });
}

/** Checks (and uses up) the emailed code; null when it's right, otherwise the error to show. */
async function checkCode(email: string, code: string): Promise<Extract<EmailVerify, { status: 'error' }> | null> {
  const ref = db.collection('auth_codes').doc(`em_${emailKey(email)}`);
  const outcome = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const data = snap.data();
    if (!snap.exists || !data || Date.now() > Number(data.expiresAt)) return 'expired' as const;
    if (Number(data.attempts) >= MAX_ATTEMPTS) return 'locked' as const;
    const ok = timingSafeEqual(Buffer.from(String(data.hash), 'hex'), hashCode(email, code));
    if (ok) t.delete(ref);
    else t.update(ref, { attempts: FieldValue.increment(1) });
    return ok ? ('ok' as const) : ('wrong' as const);
  });
  if (outcome === 'expired') return { status: 'error', message: 'That code has expired. Ask for a new one.', http: 400 };
  if (outcome === 'locked') return { status: 'error', message: 'Too many wrong tries. Ask for a new code.', http: 429 };
  if (outcome === 'wrong') return { status: 'error', message: "That code isn't right. Check your email and try again.", http: 400 };
  return null;
}

export async function verifyEmailLogin(rawEmail: string, rawCode: string): Promise<EmailVerify> {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || '').replace(/\D/g, '');
  if (!isValidEmail(email) || code.length !== 6) return { status: 'error', message: 'Enter the 6-digit code from the email.', http: 400 };

  const bad = await checkCode(email, code);
  if (bad) return bad;

  const phone = await phoneFor(email);
  const token = await adminAuth().createCustomToken(`em_${emailKey(email)}`, { phone, phones: getPhoneVariants(phone), loginEmail: email });
  return { status: 'ok', token, phone };
}

export type EmailLink = { status: 'linked'; email: string } | { status: 'error'; message: string; http: number };

/**
 * A signed-in WhatsApp-number account adds an email: after the emailed code checks out, that email signs in to this same
 * account. If the email already had an email-only account (a stand-in number), its data is merged into this one; if it
 * belongs to a different real number, it can't be taken.
 */
export async function linkEmailToAccount(rawEmail: string, rawCode: string, idToken: string): Promise<EmailLink> {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || '').replace(/\D/g, '');
  if (!isValidEmail(email) || code.length !== 6) return { status: 'error', message: 'Enter the 6-digit code from the email.', http: 400 };
  let decoded: { uid: string; phone?: unknown };
  try {
    decoded = await adminAuth().verifyIdToken(idToken);
  } catch {
    return { status: 'error', message: 'Your sign-in expired. Sign in again.', http: 401 };
  }
  const uid = decoded.uid;
  const user = await adminAuth().getUser(uid);
  // The number is in the verified sign-in token (a code sign-in keeps it there, not on the stored user)
  const phone = String(decoded.phone || user.customClaims?.phone || '');
  if (!phone) return { status: 'error', message: 'Verify your WhatsApp number first.', http: 409 };
  if (isStandIn(phone)) return { status: 'error', message: 'This account already signs in with email.', http: 409 };

  const idRef = db.collection('email_identities').doc(emailKey(email));
  const existing = await idRef.get();
  const other = existing.exists ? String(existing.data()!.phone) : null;
  if (other && other !== phone && !isStandIn(other)) return { status: 'error', message: 'That email is already linked to another WhatsApp number.', http: 409 };

  const bad = await checkCode(email, code);
  if (bad) return bad;

  if (other && other !== phone) await mergeAccounts(other, phone);
  await idRef.set({ email, phone, createdAt: existing.exists ? existing.data()!.createdAt : FieldValue.serverTimestamp() }, { merge: true });
  await adminAuth().setCustomUserClaims(uid, { ...(user.customClaims || {}), phone, phones: getPhoneVariants(phone), loginEmail: email });
  return { status: 'linked', email };
}
