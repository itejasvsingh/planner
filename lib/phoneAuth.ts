import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { adminAuth, db, FieldValue } from './firebase';
import { consumeRateLimit } from './rateLimit';
import { getPhoneVariants, isValidPhone, normalizePhone } from './phone';
import { sendLoginCode } from './whatsappSend';

/**
 * WhatsApp-number sign-in. The server sends a 6-digit code on WhatsApp; a correct code returns a Firebase
 * custom token whose claims list the number's spellings (`phones`), which the Firestore rules check against
 * each document's ownerId. A Google-signed-in user verifies the same way to link their number.
 *
 * Codes live in `auth_codes/<phone>` (server-only): a hash, an expiry and an attempt count.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const HOUR = 60 * 60 * 1000;

const hash = (phone: string, code: string) => createHash('sha256').update(`${phone}:${code}`).digest();

export type StartResult = { status: 'sent'; template: boolean } | { status: 'error'; message: string; http: number };

export async function startPhoneLogin(rawPhone: string, ip: string): Promise<StartResult> {
  const phone = normalizePhone(rawPhone);
  if (!isValidPhone(phone)) return { status: 'error', message: 'Enter your WhatsApp number with country code, e.g. 919876543210.', http: 400 };

  const [byPhone, byIp] = await Promise.all([
    consumeRateLimit(`authcode_phone_${phone}`, 6, HOUR),
    consumeRateLimit(`authcode_ip_${ip}`, 30, HOUR),
  ]);
  if (!byPhone || !byIp) return { status: 'error', message: 'Too many codes requested. Try again in an hour.', http: 429 };

  const ref = db.collection('auth_codes').doc(phone);
  const prev = await ref.get();
  if (prev.exists && Date.now() - Number(prev.data()?.sentAt || 0) < RESEND_AFTER_MS) {
    return { status: 'error', message: 'A code was just sent. Wait 30 seconds before asking for another.', http: 429 };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await ref.set({ hash: hash(phone, code).toString('hex'), expiresAt: Date.now() + CODE_TTL_MS, sentAt: Date.now(), attempts: 0 });
  const sent = await sendLoginCode(phone, code);
  if (!sent.ok) return { status: 'error', message: "Couldn't send a WhatsApp message right now. Try again shortly.", http: 502 };
  return { status: 'sent', template: sent.template };
}

export type VerifyResult =
  | { status: 'ok'; token: string; phone: string }
  | { status: 'linked'; phone: string }
  | { status: 'error'; message: string; http: number };

/**
 * Checks the code. Without `idToken` it returns a custom token for signing in with the number; with the
 * ID token of a signed-in (Google) user it adds the number to that account instead.
 */
export async function verifyPhoneLogin(rawPhone: string, rawCode: string, idToken?: string): Promise<VerifyResult> {
  const phone = normalizePhone(rawPhone);
  const code = String(rawCode || '').replace(/\D/g, '');
  if (!isValidPhone(phone) || code.length !== 6) return { status: 'error', message: 'Enter the 6-digit code from WhatsApp.', http: 400 };

  const ref = db.collection('auth_codes').doc(phone);
  const outcome = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const data = snap.data();
    if (!snap.exists || !data || Date.now() > Number(data.expiresAt)) return 'expired' as const;
    if (Number(data.attempts) >= MAX_ATTEMPTS) return 'locked' as const;
    const ok = timingSafeEqual(Buffer.from(String(data.hash), 'hex'), hash(phone, code));
    if (ok) t.delete(ref);
    else t.update(ref, { attempts: FieldValue.increment(1) });
    return ok ? ('ok' as const) : ('wrong' as const);
  });
  if (outcome === 'expired') return { status: 'error', message: 'That code has expired. Ask for a new one.', http: 400 };
  if (outcome === 'locked') return { status: 'error', message: 'Too many wrong tries. Ask for a new code.', http: 429 };
  if (outcome === 'wrong') return { status: 'error', message: "That code isn't right. Check WhatsApp and try again.", http: 400 };

  const claims = { phone, phones: getPhoneVariants(phone) };
  if (idToken) {
    let uid: string;
    try {
      uid = (await adminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return { status: 'error', message: 'Your sign-in expired. Sign in again.', http: 401 };
    }
    const user = await adminAuth().getUser(uid);
    await adminAuth().setCustomUserClaims(uid, { ...(user.customClaims || {}), ...claims });
    await db.collection('users').doc(uid).set({ phone, phoneVerifiedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { status: 'linked', phone };
  }
  const token = await adminAuth().createCustomToken(`wa_${phone}`, claims);
  return { status: 'ok', token, phone };
}
