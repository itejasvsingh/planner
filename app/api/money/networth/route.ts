import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { deleteNetEntry, saveNetEntry } from '../../../../lib/moneyAccounts';

export const dynamic = 'force-dynamic';

const ID = /^[\w-]{1,40}$/;

/** Only known fields, checked; anything else is dropped. Returns an error text when a given field is wrong. */
function clean(e: Record<string, unknown>): { ok: { name?: string; kind?: 'asset' | 'liability'; value?: number } } | { error: string } {
  const ok: { name?: string; kind?: 'asset' | 'liability'; value?: number } = {};
  if (e.name !== undefined) {
    const name = typeof e.name === 'string' ? e.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > 40) return { error: 'Give it a name (up to 40 characters).' };
    ok.name = name;
  }
  if (e.kind !== undefined) {
    if (e.kind !== 'asset' && e.kind !== 'liability') return { error: 'Is it something you own or something you owe?' };
    ok.kind = e.kind;
  }
  if (e.value !== undefined) {
    if (typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value < 0 || e.value >= 1e11) return { error: 'The value should be a number, 0 or more.' };
    ok.value = Math.round(e.value * 100) / 100;
  }
  return { ok };
}

/** Body: { add: {name, kind, value} } returns { id }; { id, edit } changes one; { remove: id } deletes one. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body.remove === 'string') {
    if (!ID.test(body.remove)) return NextResponse.json({ error: 'Which entry?' }, { status: 400 });
    await deleteNetEntry(user.phone, body.remove);
    return NextResponse.json({ ok: true });
  }
  if (body.add && typeof body.add === 'object') {
    const r = clean(body.add as Record<string, unknown>);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    if (!r.ok.name || !r.ok.kind || r.ok.value === undefined) return NextResponse.json({ error: 'A name, asset or liability, and a value.' }, { status: 400 });
    const id = await saveNetEntry(user.phone, r.ok);
    if (!id) return NextResponse.json({ error: 'That is plenty of entries (50). Remove one first.' }, { status: 400 });
    return NextResponse.json({ ok: true, id });
  }
  if (typeof body.id !== 'string' || !ID.test(body.id) || !body.edit || typeof body.edit !== 'object') {
    return NextResponse.json({ error: 'Which entry, and what to change?' }, { status: 400 });
  }
  const r = clean(body.edit as Record<string, unknown>);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  const saved = await saveNetEntry(user.phone, { id: body.id, ...r.ok });
  if (!saved) return NextResponse.json({ error: 'That entry is gone.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
