import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { linkStatus } from '../../../../lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  return NextResponse.json(await linkStatus(user.phone));
}
