import { db, FieldValue } from './firebase';

/** Fixed-window counter in `rate_limits`. Returns false when `key` has exceeded `max` within `windowMs`. */
export async function consumeRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
    const ref = db.collection('rate_limits').doc(key.replace(/[^a-zA-Z0-9_-]/g, '_'));
    return db.runTransaction(async (tx: any) => {
        const snap = await tx.get(ref);
        const now = Date.now();
        const data = snap.exists ? snap.data() : null;
        if (!data || typeof data.resetAt !== 'number' || now > data.resetAt) {
            tx.set(ref, { count: 1, resetAt: now + windowMs, updatedAt: FieldValue.serverTimestamp() });
            return true;
        }
        if ((data.count || 0) >= max) return false;
        tx.update(ref, { count: FieldValue.increment(1) });
        return true;
    });
}
