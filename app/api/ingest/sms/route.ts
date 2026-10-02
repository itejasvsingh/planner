import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db, firebase } from '../../../../lib/firebase';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { parseTransactionSms, guessCategory, type ParsedTransaction } from '../../../../lib/smsParse';
import { alertWindow } from '../../../../lib/emailAlert';

export const dynamic = 'force-dynamic';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function dateIST(at: Date) {
  const now = new Date(at.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function todayIST() {
  return dateIST(new Date());
}

/** The email's own date (sent by the Gmail script) when the alert text has none; ignored if implausible. */
function sentDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const at = new Date(raw);
  const age = Date.now() - at.getTime();
  return Number.isFinite(age) && age > -86400000 && age < 400 * 86400000 ? dateIST(at) : null;
}

/** Fallback for bank formats the rules don't know. Only called for text that looks like a completed transaction. */
async function parseWithGemini(text: string): Promise<ParsedTransaction | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    const prompt = `Extract the completed bank/UPI/card transaction from this SMS. If it is not a completed debit or credit
(OTP, reminder, request, offer, failed, scheduled), return {"type":null}.
Return JSON: {"type":"expense"|"income"|null,"amount":number,"merchant":"short payee/payer name","ref":"reference number or null","date":"YYYY-MM-DD or null"}
SMS: """${text.slice(0, 600)}"""`;
    const out = JSON.parse((await model.generateContent(prompt)).response.text() || '{}');
    if ((out.type !== 'expense' && out.type !== 'income') || !(Number(out.amount) > 0)) return null;
    const merchant = String(out.merchant || '').slice(0, 40) || (out.type === 'expense' ? 'Card / UPI payment' : 'Money received');
    return {
      type: out.type,
      amount: Number(out.amount),
      merchant,
      category: guessCategory(`${merchant} ${text}`, out.type),
      ref: out.ref ? String(out.ref) : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(out.date || '') ? out.date : null,
    };
  } catch (e) {
    console.warn('SMS Gemini fallback failed:', (e as Error).message);
    return null;
  }
}

/**
 * Receives bank SMS (Android app, iOS Shortcut) and bank alert emails (the user's Gmail Apps Script, with
 * source: 'email') and records the transaction.
 * Auth: per-user secret token (body.token or Authorization: Bearer), mapped to the user via
 * planner_settings/ingest_<sha256(token)>.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const auth = req.headers.get('authorization');
  // Key from the body, a Bearer header, or ?k= (the one-link iPhone Shortcut setup; the key only allows adding SMS)
  const queryKey = new URL(req.url).searchParams.get('k');
  const token = String(body.token || (auth?.startsWith('Bearer ') ? auth.slice(7) : '') || queryKey || '').trim();
  const source: 'sms' | 'email' = body.source === 'email' ? 'email' : 'sms';
  const raw = typeof body.text === 'string' ? body.text.trim().slice(0, 8000) : '';
  // Emails wrap the transaction in greetings and disclaimers; keep just the transaction sentences.
  const text = source === 'email' ? alertWindow(raw) || '' : raw;

  if (token.length < 20) return NextResponse.json({ status: 'error', message: 'Missing or invalid token' }, { status: 401 });
  if (!raw) return NextResponse.json({ status: 'error', message: 'No message text' }, { status: 400 });

  const tokenHash = sha256(token);
  try {
    if (!(await consumeRateLimit(`ingest_${tokenHash.slice(0, 32)}`, 200, 60 * 60 * 1000))) {
      return NextResponse.json({ status: 'error', message: 'Too many messages this hour' }, { status: 429 });
    }
  } catch {
    // Rate limiter unavailable: continue; the token check below still applies
  }

  const link = await db.collection('planner_settings').doc(`ingest_${tokenHash}`).get();
  const phone = link.exists ? String(link.data()?.phone || '') : '';
  if (!phone) return NextResponse.json({ status: 'error', message: 'Unknown token. Create a new one in Align Settings.' }, { status: 401 });

  let tx = text ? parseTransactionSms(text) : null;
  if (!tx && text && /(?:rs\.?|inr|₹)\s*[\d,]/i.test(text) && /debit|credit|spent|paid|sent|received/i.test(text)) {
    tx = await parseWithGemini(text);
  }
  if (!tx) return NextResponse.json({ status: 'ignored', message: 'Not a transaction' });
  // Settings "Test" button: confirm the key works and show what would be recorded, without saving
  if (body.dryRun === true) {
    return NextResponse.json({ status: 'test', message: `Works! Would add ₹${tx.amount.toLocaleString('en-IN')} · ${tx.merchant} · ${tx.category}`, ...tx });
  }

  // Same payment can arrive more than once (SMS + email, or a re-run Shortcut): key on the bank ref when present
  const dedupKey = tx.ref ? `ref_${tx.ref}` : `txt_${sha256(text.replace(/\s+/g, ' ').toLowerCase()).slice(0, 24)}`;
  const ref = db.collection('planner_items').doc(`auto_${sha256(`${phone}_${dedupKey}`).slice(0, 28)}`);
  const date = tx.date || sentDate(body.date) || todayIST();

  // Without a bank ref, the same card spend can arrive as both an SMS and an email with different text:
  // treat a same-day, same-amount item recorded from the other channel as this one.
  if (!tx.ref) {
    const other = source === 'sms' ? 'email' : 'sms';
    const same = await db.collection('planner_items').where('ownerId', '==', phone).where('date', '==', date).where('amount', '==', tx.amount).limit(10).get();
    if (same.docs.some((d: any) => d.data()?.source === other && d.data()?.type === tx!.type)) {
      return NextResponse.json({ status: 'duplicate', message: `Already recorded from ${other === 'sms' ? 'SMS' : 'email'}: ₹${tx.amount.toLocaleString('en-IN')}` });
    }
  }

  const created = await db.runTransaction(async (t: any) => {
    if ((await t.get(ref)).exists) return false;
    t.set(ref, {
      ownerId: phone,
      type: tx!.type,
      title: tx!.merchant,
      amount: tx!.amount,
      date,
      dueDate: date,
      category: tx!.category,
      tags: [tx!.category],
      splits: [],
      source,
      autoDetected: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });

  const label = `₹${tx.amount.toLocaleString('en-IN')} ${tx.type === 'expense' ? 'to' : 'from'} ${tx.merchant}`;
  return created
    ? NextResponse.json({ status: 'added', message: `Added: ${label}`, type: tx.type, amount: tx.amount, merchant: tx.merchant, category: tx.category })
    : NextResponse.json({ status: 'duplicate', message: `Already recorded: ${label}` });
}
