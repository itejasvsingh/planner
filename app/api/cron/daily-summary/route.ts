import { NextResponse } from 'next/server';
import { db } from '../../../../lib/firebase';
import { runDailySummaryForUser } from '../../../../lib/dailySummary';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const targetPhone = searchParams.get('phone');
        const force = searchParams.get('force') === 'true';

        // 1. Single user test mode (e.g., /api/cron/daily-summary?phone=918130595547)
        if (targetPhone) {
            console.log(`🚀 Executing daily summary on-demand for single user: ${targetPhone}`);
            const result = await runDailySummaryForUser(targetPhone, { force: true });
            return NextResponse.json(result);
        }

        // 2. Multi-user automated cron mode
        // Find all unique users who have active sessions or preferences
        const phonesToProcess = new Set<string>();

        // Check user_sessions
        const sessionsSnap = await db.collection('user_sessions').get().catch(() => null);
        if (sessionsSnap) {
            sessionsSnap.docs.forEach(d => {
                const phone = d.id.replace(/\D/g, '');
                if (phone.length >= 10) phonesToProcess.add(phone.length === 10 ? `91${phone}` : phone);
            });
        }

        // Check preferences in planner_settings
        const settingsSnap = await db.collection('planner_settings').get().catch(() => null);
        if (settingsSnap) {
            settingsSnap.docs.forEach(d => {
                if (d.id.startsWith('preferences_') || d.id.startsWith('budgets_')) {
                    const phone = d.id.replace(/^(preferences_|budgets_)/, '').replace(/\D/g, '');
                    if (phone.length >= 10) phonesToProcess.add(phone.length === 10 ? `91${phone}` : phone);
                }
            });
        }

        const phoneList = Array.from(phonesToProcess);
        console.log(`⏰ Daily summary cron triggered for ${phoneList.length} users...`);

        const results: any[] = [];
        for (const phone of phoneList) {
            try {
                const res = await runDailySummaryForUser(phone, { force });
                results.push({ phone, ...res });
            } catch (err: any) {
                console.error(`❌ Daily summary failed for ${phone}:`, err.message);
                results.push({ phone, success: false, error: err.message });
            }
        }

        return NextResponse.json({
            status: 'completed',
            totalUsers: phoneList.length,
            results
        });

    } catch (error: any) {
        console.error("❌ Cron /api/cron/daily-summary error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    return GET(req);
}

