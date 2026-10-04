import { NextResponse } from 'next/server';
import { runTaskRolloverForUser, runTaskRolloverForAllUsers } from '../../../../lib/taskRollover';
import { hasCronSecret } from '../../../../lib/cronAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!hasCronSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const targetPhone = searchParams.get('phone');
        const force = searchParams.get('force') === 'true';

        // 1. One person, on demand (scheduler secret only); replies with a count, never task titles
        if (targetPhone) {
            const result = await runTaskRolloverForUser(targetPhone, { force: true });
            return NextResponse.json({ success: result.success, rolledOverCount: result.rolledOverCount });
        }

        // 2. Automated midnight cron mode across all users
        console.log("⏰ 12:00 AM Midnight Auto-Push cron invoked...");
        const result = await runTaskRolloverForAllUsers({ force });

        return NextResponse.json({
            status: 'completed',
            timestamp: new Date().toISOString(),
            // Counts only: no phone numbers or task titles in the reply
            totalUsers: result.totalUsers,
            rolledOver: result.results.reduce((n, r) => n + (r.rolledOverCount || 0), 0),
        });

    } catch (error: any) {
        console.error("❌ Cron /api/cron/auto-push error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    return GET(req);
}

