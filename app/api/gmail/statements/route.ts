import { after, NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { db } from '../../../../lib/firebase';
import { BANKS, bankNameById } from '../../../../lib/bankSenders';
import { kindsFor, setStatementPassword, statementGroups, STATEMENT_MONTHS } from '../../../../lib/statementAuto';
import { readInBackground } from '../../../../lib/statementReader';
import { checkStatementPassword } from '../../../../lib/gmail';
import { setBankCardsClosed } from '../../../../lib/moneyAccounts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  // { closeCards: bankId, closed: boolean }: every credit card from that bank is closed (or open again)
  if (typeof body.closeCards === 'string') {
    const bankId = body.closeCards;
    if (!BANKS.some((b) => b.id === bankId) && !/^in_[a-z0-9-]{1,40}$/.test(bankId)) return NextResponse.json({ error: 'Unknown bank.' }, { status: 400 });
    const exists = (await db.collection('gmail_links').doc(user.phone).get()).exists;
    if (!exists) return NextResponse.json({ error: 'Connect Gmail first.' }, { status: 409 });
    await setBankCardsClosed(user.phone, bankId, body.closed !== false);
    return NextResponse.json({ ok: true, bank: bankId, closed: body.closed !== false });
  }
  // { months: 3 | 6 | 12 }: how far back statements are read (3 unless the user asks for more)
  if (body.months !== undefined) {
    const months = Number(body.months);
    if (!STATEMENT_MONTHS.includes(months)) return NextResponse.json({ error: 'Choose 3, 6 or 12 months.' }, { status: 400 });
    const ref = db.collection('gmail_links').doc(user.phone);
    const link = await ref.get();
    if (!link.exists) return NextResponse.json({ error: 'Connect Gmail first.' }, { status: 409 });
    await ref.update({ statementMonths: months });
    const started = Date.now();
    after(() => readInBackground(user.phone, started));
    return NextResponse.json({ ok: true, months });
  }
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
  // A password that doesn't open the latest statement isn't saved: the user is told to try again
  if (password && (await checkStatementPassword(user.phone, bank.id, kind, password)) === 'wrong') {
    return NextResponse.json({
      error: `That password didn’t open your latest ${bank.name} ${kind === 'card' ? 'credit card' : 'account'} statement. Check how the bank’s email says it’s made (often part of your name and date of birth) and try again.`,
      wrongPassword: true,
    }, { status: 422 });
  }
  await setStatementPassword(user.phone, bank.id, password, kind);
  // Read the statements waiting for this password in the background; the app refreshes its lists shortly
  if (password) {
    const started = Date.now();
    after(() => readInBackground(user.phone, started));
  }
  return NextResponse.json({ ok: true, bank: bank.id, kind, hasPassword: !!password, reading: !!password });
}
