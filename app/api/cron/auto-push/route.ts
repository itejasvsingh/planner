import { NextResponse } from 'next/server';
import { runTaskRolloverForUser, runTaskRolloverForAllUsers } from '../../../../lib/taskRollover';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const targetPhone = searchParams.get('phone');
        const force = searchParams.get('force') === 'true';

        // 1. Single user test / on-demand execution (e.g., /api/cron/auto-push?phone=918130595547)
        if (targetPhone) {
            console.log(`🚀 Executing 12 AM task rollover for single user: ${targetPhone}`);
            const result = await runTaskRolloverForUser(targetPhone, { force: true });
            return NextResponse.json(result);
        }

        // 2. Automated midnight cron mode across all users
        console.log("⏰ 12:00 AM Midnight Auto-Push cron invoked...");
        const result = await runTaskRolloverForAllUsers({ force });

        return NextResponse.json({
            status: 'completed',
            timestamp: new Date().toISOString(),
            ...result
        });

    } catch (error: any) {
        console.error("❌ Cron /api/cron/auto-push error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    return GET(req);
}
