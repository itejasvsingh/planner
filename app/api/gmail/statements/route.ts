import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { db } from '../../../../lib/firebase';
import { BANKS } from '../../../../lib/bankSenders';
import { setStatementPassword, type StatementPassword, type StatementState } from '../../../../lib/statementAuto';

export const dynamic = 'force-dynamic';

/**
 * Statement PDFs read from Gmail, per bank: whether a password is saved (never the password itself) and how
 * the last statement went. Lists the banks picked in Settings → Gmail, plus any a statement came from.
 */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const link = (await db.collection('gmail_links').doc(user.phone).get()).data();
  if (!link) return NextResponse.json({ banks: [] });
  const passwords = (link.statementPasswords || {}) as Record<string, StatementPassword>;
  const status = (link.statementStatus || {}) as Record<string, StatementState>;
  const ids = new Set<string>([...(link.banks || link.detected || []), ...Object.keys(status), ...Object.keys(passwords)]);
  const banks = BANKS.filter((b) => ids.has(b.id) && b.id !== 'otherbankin').map((b) => ({
    id: b.id,
    name: b.name,
    hasPassword: !!passwords[b.id],
    status: status[b.id] || null,
  }));
  return NextResponse.json({ banks });
}

/** Body: { bank: id, password: string | null }. Saves the bank's PDF password (sealed), or removes it. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const bank = BANKS.find((b) => b.id === body.bank);
  if (!bank) return NextResponse.json({ error: 'Unknown bank.' }, { status: 400 });
  const password = typeof body.password === 'string' ? body.password.trim() : null;
  if (password !== null && (password.length < 1 || password.length > 64)) return NextResponse.json({ error: 'Enter the password (up to 64 characters).' }, { status: 400 });
  const link = await db.collection('gmail_links').doc(user.phone).get();
  if (!link.exists) return NextResponse.json({ error: 'Connect Gmail first.' }, { status: 409 });
  await setStatementPassword(user.phone, bank.id, password);
  return NextResponse.json({ ok: true, bank: bank.id, hasPassword: !!password });
}
