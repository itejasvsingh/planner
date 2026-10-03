import { NextResponse } from 'next/server';
import { requestUser } from '../../../../lib/requestUser';
import { db } from '../../../../lib/firebase';
import { setBillReminders, upcomingBills } from '../../../../lib/cardBills';

export const dynamic = 'force-dynamic';

/** Card bills found in Gmail and whether the user wants reminders (null = not asked yet). */
export async function GET(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const link = (await db.collection('gmail_links').doc(user.phone).get()).data();
  if (!link) return NextResponse.json({ reminders: null, bills: [] });
  const reminders = typeof link.billReminders === 'boolean' ? link.billReminders : null;
  return NextResponse.json({ reminders, bills: await upcomingBills(user.phone) });
}

/** Body: { remind: boolean } — the user's answer to "Remind me before card bills are due?" */
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body.remind !== 'boolean') return NextResponse.json({ error: 'remind must be true or false' }, { status: 400 });
  const link = await db.collection('gmail_links').doc(user.phone).get();
  if (!link.exists) return NextResponse.json({ error: 'Connect Gmail first.' }, { status: 409 });
  return NextResponse.json({ reminders: body.remind, ...(await setBillReminders(user.phone, body.remind)) });
}
