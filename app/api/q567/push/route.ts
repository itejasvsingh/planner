import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { sanitizeQ567Push } from '../../../../lib/q567';
import { q567Configured, q567Env, saveQ567 } from '../../../../lib/q567Store';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 600_000;

/** The q567 pusher sends the timetable data here, with `Authorization: Bearer <Q567_PUSH_SECRET>`. */
export async function POST(req: Request) {
  if (!q567Configured()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const given = Buffer.from((req.headers.get('authorization') || '').replace(/^Bearer /, ''));
  const want = Buffer.from(q567Env().secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: 'Too large.' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Bad JSON.' }, { status: 400 }); }
  const clean = sanitizeQ567Push(body);
  if (!clean) return NextResponse.json({ error: 'Nothing usable in that.' }, { status: 400 });
  await saveQ567(clean);
  return NextResponse.json({ ok: true, days: Object.keys(clean.daily || {}).length });
}
