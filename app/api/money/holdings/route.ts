import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { cleanHolding, listHoldings, removeHolding, saveHolding } from '../../../../lib/holdings';
import { navsFor } from '../../../../lib/amfi';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** The signed-in person's holdings, with today's NAV for each mutual fund (from AMFI's public list). */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const holdings = await listHoldings(user.phone);
  const navs = await navsFor(holdings.filter((h) => h.type === 'mf' && h.schemeCode).map((h) => String(h.schemeCode))).catch(() => ({}));
  return NextResponse.json({ holdings, navs });
}

/** Body: { add: holding } | { id, edit: holding } | { remove: id }. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const idOk = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);
  try {
    if (idOk(body.remove)) {
      await removeHolding(user.phone, body.remove);
      return NextResponse.json({ ok: true });
    }
    const payload = body.add && typeof body.add === 'object' ? body.add : idOk(body.id) && body.edit && typeof body.edit === 'object' ? body.edit : null;
    if (!payload) return NextResponse.json({ error: 'What should change?' }, { status: 400 });
    const checked = cleanHolding(payload as Record<string, unknown>);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const id = await saveHolding(user.phone, checked.holding, idOk(body.id) && body.edit ? body.id : undefined);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
