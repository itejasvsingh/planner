import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { syncAll } from '../../../../lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Called every 15 minutes by .github/workflows/gmail-sync.yml with the GMAIL_SYNC_SECRET header. */
export async function POST(req: Request) {
  const secret = process.env.GMAIL_SYNC_SECRET || '';
  const given = req.headers.get('x-sync-secret') || '';
  if (!secret || !timingSafeEqual(digest(secret), digest(given))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await syncAll(Date.now() + 50_000));
}
