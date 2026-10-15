import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { getPhoneVariants } from '../../../../lib/phone';
import { buildQ567Classes } from '../../../../lib/q567';
import { loadQ567, q567Configured, q567Env } from '../../../../lib/q567Store';

export const dynamic = 'force-dynamic';

const istDay = (offsetDays: number) => new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);

/** Your class timetable for a date range. Off, and silent about it, for anyone but the configured owner. */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const owner = new Set(getPhoneVariants(q567Env().ownerPhone));
  if (!q567Configured() || !getPhoneVariants(user.phone).some(p => owner.has(p))) return NextResponse.json({ enabled: false });

  const url = new URL(req.url);
  const day = (v: string | null, fallback: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);
  const from = day(url.searchParams.get('from'), istDay(0));
  const to = day(url.searchParams.get('to'), istDay(60));
  const data = await loadQ567();
  const classes = data ? buildQ567Classes({ daily: data.daily, changes: data.changes, electives: data.electives || [], hidden: data.hidden }).filter(c => c.date >= from && c.date <= to) : [];
  return NextResponse.json({ enabled: true, classes, updatedAt: data?.updatedAt || null });
}
