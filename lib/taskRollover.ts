import { db } from './firebase';
import { getKolkataDateInfo } from './dailySummary';

export interface RolloverResult {
    success: boolean;
    reason?: string;
    targetPhone?: string;
    rolledOverCount: number;
    tasks?: { id: string; title: string; fromDate: string; toDate: string }[];
}

/**
 * Executes 12:00 AM Midnight Task Rollover for a specific user.
 * Shifts incomplete tasks from yesterday (or past dates) to today's date
 * ONLY if the user has autoPushEnabled set to true (or options.force is set).
 */
export async function runTaskRolloverForUser(userPhone: string, options?: { force?: boolean }): Promise<RolloverResult> {
    const digits = String(userPhone || '').replace(/\D/g, '');
    const targetPhone = digits.length === 10 ? `91${digits}` : digits;

    if (!targetPhone) {
        return { success: false, reason: 'Invalid phone number', rolledOverCount: 0, tasks: [] };
    }

    // 1. Check user preferences
    const [prefSnap, sessionSnap] = await Promise.all([
        db.collection('planner_settings').doc(`preferences_${targetPhone}`).get().catch(() => null),
        db.collection('user_sessions').doc(targetPhone).get().catch(() => null)
    ]);

    const prefData = prefSnap?.exists ? prefSnap.data() : null;
    const sessionData = sessionSnap?.exists ? sessionSnap.data() : null;

    const isAutoPushEnabled = prefData?.autoPushEnabled !== false && sessionData?.autoPushEnabled !== false;

    if (!isAutoPushEnabled && !options?.force) {
        console.log(`⏭️ Rollover skipped for ${targetPhone}: auto-push rollover is disabled by user.`);
        return { success: false, targetPhone, reason: 'Auto-push disabled by user', rolledOverCount: 0, tasks: [] };
    }

    const { todayKey } = getKolkataDateInfo();

    // 2. Query incomplete tasks for this user
    const snapshot = await db.collection('planner_items')
        .where('ownerId', '==', targetPhone)
        .where('type', '==', 'task')
        .where('done', '==', false)
        .get();

    const tasksToRollover: { id: string; title: string; taskDate: string }[] = [];

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const taskDate = data.dueDate || data.date;
        // Check if task date is strictly in the past (before today's date)
        if (taskDate && taskDate < todayKey) {
            tasksToRollover.push({
                id: doc.id,
                title: data.title || 'Untitled Task',
                taskDate
            });
        }
    });

    if (tasksToRollover.length === 0) {
        console.log(`✅ No overdue tasks to rollover for ${targetPhone}.`);
        return {
            success: true,
            targetPhone,
            reason: 'No overdue tasks found',
            rolledOverCount: 0,
            tasks: []
        };
    }

    // 3. Perform batch update to advance tasks to todayKey
    const rolledOverDetails: { id: string; title: string; fromDate: string; toDate: string }[] = [];
    const updatePromises = tasksToRollover.map(task => {
        rolledOverDetails.push({
            id: task.id,
            title: task.title,
            fromDate: task.taskDate,
            toDate: todayKey
        });

        return db.collection('planner_items').doc(task.id).update({
            dueDate: todayKey,
            rolledOverFrom: task.taskDate,
            updatedAt: new Date().toISOString()
        });
    });

    await Promise.all(updatePromises);
    console.log(`🔄 [12:00 AM Rollover] Advanced ${tasksToRollover.length} incomplete tasks to ${todayKey} for ${targetPhone}`);

    // 4. Update session metadata
    await db.collection('user_sessions').doc(targetPhone).set({
        lastRolloverDate: todayKey,
        lastRolloverRunAt: new Date().toISOString()
    }, { merge: true });

    return {
        success: true,
        targetPhone,
        rolledOverCount: tasksToRollover.length,
        tasks: rolledOverDetails
    };
}

/**
 * Runs 12:00 AM Midnight Task Rollover for all registered users across sessions & preferences.
 */
export async function runTaskRolloverForAllUsers(options?: { force?: boolean }): Promise<{
    totalUsers: number;
    results: RolloverResult[];
}> {
    const phonesToProcess = new Set<string>();

    const [sessionsSnap, settingsSnap] = await Promise.all([
        db.collection('user_sessions').get().catch(() => null),
        db.collection('planner_settings').get().catch(() => null)
    ]);

    if (sessionsSnap) {
        sessionsSnap.docs.forEach(d => {
            const phone = d.id.replace(/\D/g, '');
            if (phone.length >= 10) phonesToProcess.add(phone.length === 10 ? `91${phone}` : phone);
        });
    }

    if (settingsSnap) {
        settingsSnap.docs.forEach(d => {
            if (d.id.startsWith('preferences_')) {
                const phone = d.id.replace('preferences_', '').replace(/\D/g, '');
                if (phone.length >= 10) phonesToProcess.add(phone.length === 10 ? `91${phone}` : phone);
            }
        });
    }

    const phoneList = Array.from(phonesToProcess);
    console.log(`⏰ [12:00 AM Rollover] Triggered for ${phoneList.length} users...`);

    const results: RolloverResult[] = [];
    for (const phone of phoneList) {
        try {
            const res = await runTaskRolloverForUser(phone, options);
            results.push(res);
        } catch (err: any) {
            console.error(`❌ Rollover failed for ${phone}:`, err.message);
            results.push({
                success: false,
                targetPhone: phone,
                reason: err.message,
                rolledOverCount: 0
            });
        }
    }

    return {
        totalUsers: phoneList.length,
        results
    };
}

