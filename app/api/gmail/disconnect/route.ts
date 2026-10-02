import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { disconnect } from '../../../../lib/gmail';

export const dynamic = 'force-dynamic';

/** Revokes Align's Gmail access at Google and deletes the stored key. */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  await disconnect(user.phone);
  return NextResponse.json({ connected: false });
}
