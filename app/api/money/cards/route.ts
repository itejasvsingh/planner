import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requestUser } from '../../../../lib/requestUser';
import { deleteManualCard, saveCardEdit, type CardEdit } from '../../../../lib/moneyAccounts';

export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const money = (v: unknown) => (v === null ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v * 100) / 100 : undefined);

/** Only known fields, checked; anything else is dropped. */
function clean(e: Record<string, unknown>): CardEdit {
  const out: CardEdit = {};
  if (typeof e.name === 'string') out.name = e.name.trim().slice(0, 40) || null;
  if (e.last4 === null || (typeof e.last4 === 'string' && /^\d{4}$/.test(e.last4))) out.last4 = e.last4 as string | null;
  if (typeof e.hidden === 'boolean') out.hidden = e.hidden;
  if (e.forDue === null || (typeof e.forDue === 'string' && DATE.test(e.forDue))) out.forDue = e.forDue as string | null;
  if (money(e.totalDue) !== undefined) out.totalDue = money(e.totalDue);
  if (money(e.minDue) !== undefined) out.minDue = money(e.minDue);
  if (e.dueDate === null || (typeof e.dueDate === 'string' && DATE.test(e.dueDate))) out.dueDate = e.dueDate as string | null;
  if (e.paid === null || typeof e.paid === 'boolean') out.paid = e.paid as boolean | null;
  return out;
}

/**
 * Body: { key, edit } changes a card; { add: edit } adds a card by hand (returns its key);
 * { remove: key } deletes a card added by hand.
 */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (body.add && typeof body.add === 'object') {
    const edit = clean(body.add as Record<string, unknown>);
    if (!edit.name) return NextResponse.json({ error: 'Give the card a name.' }, { status: 400 });
    const key = `manual_${randomBytes(6).toString('hex')}`;
    await saveCardEdit(user.phone, key, { ...edit, manual: true });
    return NextResponse.json({ ok: true, key });
  }
  if (typeof body.remove === 'string') {
    await deleteManualCard(user.phone, body.remove);
    return NextResponse.json({ ok: true });
  }
  if (typeof body.key !== 'string' || !/^[\w.-]{1,80}$/.test(body.key) || !body.edit || typeof body.edit !== 'object') {
    return NextResponse.json({ error: 'Which card, and what to change?' }, { status: 400 });
  }
  await saveCardEdit(user.phone, body.key, clean(body.edit as Record<string, unknown>));
  return NextResponse.json({ ok: true });
}
