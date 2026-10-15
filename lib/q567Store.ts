import { db } from './firebase';
import { normalizePhone } from './phone';

/**
 * The class timetable pushed from the q567 planner (see integrations/q567-push). Align never talks to q567 itself.
 * Env: Q567_PUSH_SECRET (what the pusher sends as its bearer token) and Q567_OWNER_PHONE (the one Align number that
 * sees the timetable). Without both, the feature is off. Stored in the server-only `q567_push` collection.
 */
export const q567Env = () => ({
  secret: (process.env.Q567_PUSH_SECRET || '').trim(),
  ownerPhone: (process.env.Q567_OWNER_PHONE || '').trim(),
});

export const q567Configured = () => {
  const e = q567Env();
  return !!(e.secret.length >= 24 && e.ownerPhone);
};

const docFor = () => db.collection('q567_push').doc(normalizePhone(q567Env().ownerPhone));

export async function saveQ567(data: object) {
  await docFor().set({ ...data, updatedAt: Date.now() });
}

export async function loadQ567(): Promise<Record<string, any> | null> {
  const snap = await docFor().get();
  return snap.exists ? (snap.data() as Record<string, any>) : null;
}
