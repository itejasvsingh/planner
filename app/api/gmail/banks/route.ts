import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { bankChoices, saveBankChoices } from '../../../../lib/gmail';

export const dynamic = 'force-dynamic';

/** The bank picker: every listed bank, the ones chosen, the ones found in Gmail, and extra addresses. */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  return NextResponse.json(await bankChoices(user.phone));
}

/** Body: { banks: string[], extra: string[] } */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const saved = await saveBankChoices(user.phone, body.banks, body.extra);
  return saved.ok ? NextResponse.json(saved) : NextResponse.json({ error: 'Connect Gmail first.' }, { status: 409 });
}
