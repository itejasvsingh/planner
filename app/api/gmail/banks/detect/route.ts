import { NextResponse } from 'next/server';
import { requestUser } from '../../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../../lib/rateLimit';
import { detectBanks } from '../../../../../lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Finds which listed banks have emailed this person (one cheap Gmail search each). */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await consumeRateLimit(`gmaildetect_${user.phone}`, 6, 60 * 60 * 1000))) {
    return NextResponse.json({ error: 'Tried this a lot just now. Try again later.' }, { status: 429 });
  }
  try {
    const detected = await detectBanks(user.phone, Date.now() + 40_000);
    return detected ? NextResponse.json({ detected }) : NextResponse.json({ error: 'Connect Gmail first.' }, { status: 409 });
  } catch (e) {
    console.warn('Bank detection failed:', (e as Error).message);
    return NextResponse.json({ error: 'Could not look through Gmail just now.' }, { status: 502 });
  }
}
