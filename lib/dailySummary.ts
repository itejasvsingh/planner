import { db } from './firebase';

const API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;

export function getKolkataDateInfo() {
    const nowUtc = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(nowUtc);
    const map: Record<string, string> = {};
    for (const p of parts) {
        map[p.type] = p.value;
    }
    const year = parseInt(map.year, 10);
    const month = parseInt(map.month, 10);
    const day = parseInt(map.day, 10);
    const hours = parseInt(map.hour === '24' ? '0' : map.hour, 10);
    const minutes = parseInt(map.minute, 10);

    const pad = (n: number) => String(n).padStart(2, '0');
    const todayKey = `${year}-${pad(month)}-${pad(day)}`;

    // Tomorrow calculation
    const todayDate = new Date(Date.UTC(year, month - 1, day));
    const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowKey = `${tomorrowDate.getUTCFullYear()}-${pad(tomorrowDate.getUTCMonth() + 1)}-${pad(tomorrowDate.getUTCDate())}`;

    const formattedToday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(nowUtc);

    const formattedTomorrow = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    }).format(new Date(nowUtc.getTime() + 24 * 60 * 60 * 1000));

    return { hours, minutes, todayKey, tomorrowKey, formattedToday, formattedTomorrow };
}

async function sendWhatsAppTextMessage(to: string, text: string) {
    const activePhoneId = PHONE_ID || process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;
    const token = API_TOKEN || process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!activePhoneId || !token) {
        console.error("❌ Missing WhatsApp credentials for daily summary dispatch");
        return;
    }

    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${activePhoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: text }
            })
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error(`❌ Meta WhatsApp API Error (${res.status}):`, errBody);
        } else {
            console.log(`✅ Daily summary WhatsApp message delivered to ${to}`);
        }
    } catch (err: any) {
        console.error("❌ Network error sending daily summary WhatsApp message:", err.message);
    }
}

export async function runDailySummaryForUser(userPhone: string, options?: { force?: boolean }): Promise<{
    success: boolean;
    reason?: string;
    totalSpent?: number;
    completedCount?: number;
    rolledOverCount?: number;
    summaryText?: string;
}> {
    const digits = String(userPhone || '').replace(/\D/g, '');
    const targetPhone = digits.length === 10 ? `91${digits}` : digits;

    if (!targetPhone) {
        return { success: false, reason: 'Invalid phone number' };
    }

    const { hours, minutes, todayKey, tomorrowKey, formattedToday, formattedTomorrow } = getKolkataDateInfo();

    // 1. Check user preference (can be turned on/off in the app)
    const prefSnap = await db.collection('planner_settings').doc(`preferences_${targetPhone}`).get().catch(() => null);
    const sessionSnap = await db.collection('user_sessions').doc(targetPhone).get().catch(() => null);
    
    const prefData = prefSnap?.exists ? prefSnap.data() : null;
    const sessionData = sessionSnap?.exists ? sessionSnap.data() : null;

    // Check if user turned off the feature
    const isEnabled = prefData?.dailySummaryEnabled !== false && sessionData?.dailySummaryEnabled !== false;

    if (!isEnabled && !options?.force) {
        console.log(`⏭️ Daily summary skipped for ${targetPhone}: feature turned off by user.`);
        return { success: false, reason: 'User disabled daily summary' };
    }

    // Check if user already received summary today
    if (!options?.force && sessionData?.lastDailySummaryDate === todayKey) {
        console.log(`⏭️ Daily summary skipped for ${targetPhone}: already delivered today (${todayKey}).`);
        return { success: false, reason: 'Already delivered today' };
    }

    // Check user's preferred summary delivery time
    const userTargetTime = prefData?.dailySummaryTime || sessionData?.dailySummaryTime || '22:00';
    if (!options?.force) {
        const [targetH, targetM] = userTargetTime.split(':').map((v: string) => parseInt(v, 10) || 0);
        const targetMinutes = targetH * 60 + targetM;
        const curMinutes = hours * 60 + minutes;

        if (curMinutes < targetMinutes) {
            const pad = (n: number) => String(n).padStart(2, '0');
            console.log(`⏳ Daily summary for ${targetPhone} scheduled for ${userTargetTime}, current Kolkata time is ${pad(hours)}:${pad(minutes)}. Skipping.`);
            return {
                success: false,
                reason: `Scheduled for ${userTargetTime} (current time: ${pad(hours)}:${pad(minutes)})`
            };
        }
    }

    // 2. Fetch all user's items
    const snapshot = await db.collection('planner_items')
        .where('ownerId', '==', targetPhone)
        .get();

    const items: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 3. Filter today's expenses
    const todayExpenses = items.filter((i: any) => 
        (i.type === 'expense') && 
        (i.date === todayKey)
    );

    const totalSpent = todayExpenses.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0);

    // 4. Filter today's tasks
    const todayTasks = items.filter((i: any) => 
        (i.type === 'task') && 
        (i.dueDate === todayKey || (!i.dueDate && i.date === todayKey))
    );

    const completedTasks = todayTasks.filter((t: any) => t.done);
    const incompleteTasks = todayTasks.filter((t: any) => !t.done);

    // 5. ROLL OVER INCOMPLETE TASKS TO TOMORROW IN FIRESTORE
    const rolloverPromises: Promise<any>[] = [];
    const rolledOverDetails: { id: string; title: string; originalTime: string | null }[] = [];

    for (const task of incompleteTasks) {
        const originalTime = task.dueTime || task.reminderTime || null;
        rolledOverDetails.push({
            id: task.id,
            title: task.title || 'Untitled Task',
            originalTime
        });

        // Update task dueDate to tomorrow in Firestore
        rolloverPromises.push(
            db.collection('planner_items').doc(task.id).update({
                dueDate: tomorrowKey,
                rolledOverFrom: todayKey,
                updatedAt: new Date().toISOString()
            })
        );
    }

    if (rolloverPromises.length > 0) {
        await Promise.all(rolloverPromises);
        console.log(`🔄 Rolled over ${rolloverPromises.length} incomplete tasks to tomorrow (${tomorrowKey}) for ${targetPhone}`);
    }

    // 6. COMPOSE THE WHATSAPP WRAP-UP MESSAGE
    const lines: string[] = [];
    lines.push(`🌙 *Align Daily Wrap-Up — ${formattedToday}*\n`);

    // Section A: Financial Wrap-up
    if (todayExpenses.length > 0) {
        lines.push(`💰 *Total Spent Today:* ₹${totalSpent.toLocaleString('en-IN')}`);
        // Group or list up to 5 items
        todayExpenses.slice(0, 5).forEach((e: any) => {
            const cat = e.category || '#General';
            lines.push(`  • ${e.title}: ₹${e.amount} (${cat})`);
        });
        if (todayExpenses.length > 5) {
            lines.push(`  _...and ${todayExpenses.length - 5} more expense(s)_`);
        }
    } else {
        lines.push(`💰 *Today's Spending:* ₹0 (No expenses recorded)`);
    }

    lines.push(''); // blank line

    // Section B: Completed Tasks
    if (completedTasks.length > 0) {
        lines.push(`✅ *Completed Tasks (${completedTasks.length}):*`);
        completedTasks.forEach((t: any) => {
            lines.push(`  ✓ ${t.title}`);
        });
    } else if (todayTasks.length > 0 && incompleteTasks.length === todayTasks.length) {
        lines.push(`✅ *Completed Tasks:* 0 of ${todayTasks.length} tasks completed today.`);
    } else {
        lines.push(`✅ *Completed Tasks:* No tasks were scheduled for today.`);
    }

    lines.push(''); // blank line

    // Section C: Highlight Rolled-Over Incomplete Tasks
    if (rolledOverDetails.length > 0) {
        lines.push(`🔄 *Pushed to Tomorrow (${formattedTomorrow}) [${rolledOverDetails.length}]:*`);
        rolledOverDetails.forEach(t => {
            const timeTag = t.originalTime ? ` (Originally set for ${t.originalTime})` : '';
            lines.push(`  • *${t.title}*${timeTag} ➔ *Moved to Tomorrow*`);
        });
        lines.push(`\n_These have automatically been added to your agenda for tomorrow._`);
    } else if (todayTasks.length > 0 && completedTasks.length === todayTasks.length) {
        lines.push(`🎉 *Fantastic! All scheduled tasks for today were completed!*`);
    }

    lines.push(`\n✨ Rest well! Your agenda is set for tomorrow.`);

    const summaryMessage = lines.join('\n');

    // 7. Deliver to user via WhatsApp
    await sendWhatsAppTextMessage(targetPhone, summaryMessage);

    // 8. Update session record
    await db.collection('user_sessions').doc(targetPhone).set({
        lastDailySummaryDate: todayKey,
        lastDailySummaryRunAt: new Date().toISOString()
    }, { merge: true });

    return {
        success: true,
        totalSpent,
        completedCount: completedTasks.length,
        rolledOverCount: incompleteTasks.length,
        summaryText: summaryMessage
    };
}
