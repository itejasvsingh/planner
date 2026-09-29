import { NextResponse } from 'next/server';
import { runDailySummaryForUser } from '../../../../lib/dailySummary';
import { consumeRateLimit } from '../../../../lib/rateLimit';

export const dynamic = 'force-dynamic';

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://planner-wheat-three.vercel.app',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const phone = searchParams.get('phone');
        
        if (!phone || phone.replace(/\D/g, '').length < 10) {
            return NextResponse.json({ error: 'A valid phone is required' }, { status: 400, headers: corsHeaders() });
        }

        // Unauthenticated endpoint that sends a real WhatsApp message: cap per-number and per-IP volume (fails closed)
        const digits = phone.replace(/\D/g, '');
        const ip = (req.headers.get('x-forwarded-for')?.split(',')[0].trim()) || req.headers.get('x-real-ip') || 'unknown-ip';
        const HOUR = 60 * 60 * 1000;
        const allowed = (await consumeRateLimit(`summary_phone_${digits}`, 5, HOUR)) &&
            (await consumeRateLimit(`summary_ip_${ip}`, 20, HOUR));
        if (!allowed) {
            return NextResponse.json({ error: 'Too many summary requests. Try again later.' }, { status: 429, headers: corsHeaders() });
        }

        const result = await runDailySummaryForUser(phone, { force: true });
        return NextResponse.json(result, { status: 200, headers: corsHeaders() });
    } catch (error: any) {
        console.error('Test summary error:', error);
        return NextResponse.json({ error: error.message || 'Failed to send summary' }, { status: 500, headers: corsHeaders() });
    }
}
