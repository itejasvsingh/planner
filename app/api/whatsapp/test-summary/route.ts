import { NextResponse } from 'next/server';
import { runDailySummaryForUser } from '../../../../lib/dailySummary';

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
        
        if (!phone) {
            return NextResponse.json({ error: 'Phone is required' }, { status: 400, headers: corsHeaders() });
        }

        const result = await runDailySummaryForUser(phone, { force: true });
        return NextResponse.json(result, { status: 200, headers: corsHeaders() });
    } catch (error: any) {
        console.error('Test summary error:', error);
        return NextResponse.json({ error: error.message || 'Failed to send summary' }, { status: 500, headers: corsHeaders() });
    }
}
