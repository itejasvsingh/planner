import { createHash } from 'node:crypto';
import { db } from './firebase';
import { maskDigits } from './unparsedText';

/**
 * "Couldn't read" list: bank messages that looked like transactions but weren't understood, kept server-only in
 * money_accounts/<phone>/unparsed for 30 days so nothing disappears silently. SMS keep a masked snippet (long numbers hidden);
 * emails keep only the bank and day (an email's text is never stored). The person can dismiss them.
 */
export type Unparsed = { id: string; source: 'sms' | 'email'; bank: string | null; preview: string | null; at: number };
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const col = (phone: string) => db.collection('money_accounts').doc(phone).collection('unparsed');

export async function saveUnparsed(phone: string, m: { source: 'sms' | 'email'; text?: string; bank?: string | null; at?: number }) {
  const preview = m.source === 'sms' && m.text ? maskDigits(m.text) : null;
  const at = m.at || Date.now();
  const id = createHash('sha256').update(`${m.source}|${m.bank || ''}|${preview || ''}|${new Date(at).toISOString().slice(0, 13)}`).digest('hex').slice(0, 24);
  await col(phone).doc(id).set({ source: m.source, bank: m.bank || null, preview, at }, { merge: true });
}

export async function listUnparsed(phone: string, now = Date.now()): Promise<Unparsed[]> {
  const snap = await col(phone).get();
  const out: Unparsed[] = [];
  for (const d of snap.docs) {
    const x = d.data() as Omit<Unparsed, 'id'>;
    if (now - x.at > KEEP_MS) { await d.ref.delete(); continue; }
    out.push({ id: d.id, ...x });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 50);
}

/** One message, or 'all'. */
export async function dismissUnparsed(phone: string, id: string) {
  if (id === 'all') {
    const snap = await col(phone).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  } else {
    await col(phone).doc(id).delete();
  }
}
