import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { db } from '../../../../lib/firebase';
import { BANKS, bankNameById } from '../../../../lib/bankSenders';
import { kindsFor, setStatementPassword, statementGroups } from '../../../../lib/statementAuto';

export const dynamic = 'force-dynamic';

/**
 * Statements found in Gmail, as two lists (bank accounts, credit cards), one row per bank: how many, whether
 * they need a password, and whether one is saved (never the password itself).
 */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const link = (await db.collection('gmail_links').doc(user.phone).get()).data();
  if (!link) return NextResponse.json({ accounts: [], cards: [], searched: false });
  return NextResponse.json({ ...statementGroups(link), searched: Array.isArray(link.statementIndex) });
}

/** Body: { bank, kind: 'account' | 'card', password: string | null }. Saves the PDF password (sealed), or removes it. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  // A listed bank, or a .bank.in one Align found by its address
  const id = typeof body.bank === 'string' ? body.bank : '';
  const bank = BANKS.find((b) => b.id === id) || (/^in_[a-z0-9-]{1,40}$/.test(id) ? { id, name: bankNameById(id) } : null);
  if (!bank) return NextResponse.json({ error: 'Unknown bank.' }, { status: 400 });
  const kind = body.kind === 'card' ? 'card' : 'account';
  if (!kindsFor(bank.id).includes(kind)) return NextResponse.json({ error: `${bank.name} only sends card statements.` }, { status: 400 });
  const password = typeof body.password === 'string' ? body.password.trim() : null;
  if (password !== null && (password.length < 1 || password.length > 64)) return NextResponse.json({ error: 'Enter the password (up to 64 characters).' }, { status: 400 });
  const link = await db.collection('gmail_links').doc(user.phone).get();
  if (!link.exists) return NextResponse.json({ error: 'Connect Gmail first.' }, { status: 409 });
  await setStatementPassword(user.phone, bank.id, password, kind);
  return NextResponse.json({ ok: true, bank: bank.id, kind, hasPassword: !!password });
}
