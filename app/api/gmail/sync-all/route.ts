import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { syncAll } from '../../../../lib/gmail';
import { runPushReminders } from '../../../../lib/webPush';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Called every 15 minutes by .github/workflows/gmail-sync.yml with the GMAIL_SYNC_SECRET header: Gmail checks, then the daily push reminders. */
export async function POST(req: Request) {
  // Trimmed: a pasted secret often picks up a trailing newline in one of the two places it's stored.
  const secret = (process.env.GMAIL_SYNC_SECRET || '').trim();
  const given = (req.headers.get('x-sync-secret') || '').trim();
  if (!secret || !timingSafeEqual(digest(secret), digest(given))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await syncAll(Date.now() + 40_000);
  // The daily push reminders ride on this 15-minute call (once a day per person, after 8:30 am India time)
  const push = await runPushReminders().catch(() => ({ users: 0, sent: 0 }));
  return NextResponse.json({ ...result, push });
}
