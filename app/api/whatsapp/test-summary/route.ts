import { NextResponse } from 'next/server';

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

        const secret = process.env.TEST_SUMMARY_SECRET;
        if (!secret) {
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500, headers: corsHeaders() });
        }

        // Pass the secret via the server route itself
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://planner-wheat-three.vercel.app';
        const targetUrl = `${baseUrl}/api/cron/daily-summary?phone=${phone}&force=true&secret=${encodeURIComponent(secret)}`;
        
        const res = await fetch(targetUrl);
        const data = await res.json().catch(() => ({}));
        
        return NextResponse.json(data, { status: res.status, headers: corsHeaders() });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
    }
}
