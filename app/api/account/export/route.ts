import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { exportAccount } from '../../../../lib/accountData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Everything Align keeps about the signed-in person, as one JSON file (no secrets). */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await consumeRateLimit(`export_${user.phone}`, 5, 60 * 60 * 1000).catch(() => true))) return NextResponse.json({ error: 'Too many downloads. Try again in an hour.' }, { status: 429 });
  const data = await exportAccount(user.phone);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="align-my-data.json"', 'Cache-Control': 'no-store' },
  });
}
