import { NextResponse } from 'next/server';
import { db } from '../../../../lib/firebase';
import { runDailySummaryForUser } from '../../../../lib/dailySummary';
import { hasCronSecret } from '../../../../lib/cronAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const targetPhone = searchParams.get('phone');
        const force = searchParams.get('force') === 'true';

        // Only the scheduler's secret. (The old test secret leaked in git history and is no longer accepted;
        // people send themselves a summary from the app, signed in, via /api/whatsapp/test-summary.)
        const isCronSecretValid = hasCronSecret(req);

        if (targetPhone) {
            if (!isCronSecretValid) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            console.log(`🚀 Executing daily summary on-demand for single user: ${targetPhone}`);
            const result = await runDailySummaryForUser(targetPhone, { force: true });
            // The message goes to the person on WhatsApp; it's never returned here
            return NextResponse.json({ success: result.success, reason: (result as any).reason || null });
        }

        // Multi-user automated cron mode
        if (!isCronSecretValid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
                results.push({ success: res.success, reason: (res as any).reason || null });
            } catch (err: any) {
                console.error(`❌ Daily summary failed for ${phone}:`, err.message);
                results.push({ success: false, reason: 'error' });
            }
        }

        return NextResponse.json({
            status: 'completed',
            totalUsers: phoneList.length,
            // Counts only: no phone numbers or summary text in the reply
            sent: results.filter((r) => r.success).length,
            skipped: results.filter((r) => !r.success).length,
        });

    } catch (error: any) {
        console.error("❌ Cron /api/cron/daily-summary error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    return GET(req);
}
