import { NextResponse } from 'next/server';
import { consumeRateLimit } from '../../../lib/rateLimit';
import { readStatement } from '../../../lib/statementFile';
import { cleanNarration } from '../../../lib/statementParse';
import { guessCategory } from '../../../lib/smsParse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel caps request bodies at 4.5 MB; base64 adds a third.
const MAX_BYTES = 3 * 1024 * 1024;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://planner-wheat-three.vercel.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * Reads an uploaded bank/card statement (PDF, Excel or CSV) and returns its transactions for the app to
 * review. Nothing is stored here and no AI is involved: the app saves only the rows the user picks.
 * Body: { file: base64, password?: string }.
 */
export async function POST(req: Request) {
  const headers = corsHeaders();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const file = typeof body.file === 'string' ? body.file : '';
  const password = typeof body.password === 'string' && body.password ? body.password.slice(0, 64) : undefined;
  if (!file) return NextResponse.json({ status: 'error', message: 'No file received.' }, { status: 400, headers });

  const buf = Buffer.from(file, 'base64');
  if (!buf.length) return NextResponse.json({ status: 'error', message: 'The file is empty.' }, { status: 400, headers });
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ status: 'error', message: 'That file is over 3 MB. Download a shorter period (e.g. one or three months).' }, { status: 413, headers });
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
  const allowed = await consumeRateLimit(`statement_ip_${ip}`, 40, 60 * 60 * 1000).catch(() => true);
  if (!allowed) return NextResponse.json({ status: 'error', message: 'Too many uploads this hour. Try again later.' }, { status: 429, headers });

  try {
    const result = await readStatement(buf, password);
    if (result.status === 'password') {
      return NextResponse.json({ status: 'password', incorrect: result.incorrect }, { headers });
    }
    if (result.status === 'unreadable') {
      return NextResponse.json({ status: 'error', message: result.message }, { status: 422, headers });
    }
    const rows = result.rows.map(r => {
      const merchant = cleanNarration(r.description);
      return { ...r, merchant, category: guessCategory(`${merchant} ${r.description}`, r.type) };
    });
    return NextResponse.json({ status: 'ok', rows }, { headers });
  } catch (e) {
    console.warn('Statement read failed:', (e as Error).message);
    return NextResponse.json({ status: 'error', message: 'Could not read this statement.' }, { status: 500, headers });
  }
}
