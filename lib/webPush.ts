import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { db, FieldValue } from './firebase';
import { cardSummaries, type CardSummary } from './moneyAccounts';
import { istParts } from './recordTransaction';

/**
 * Web push to the home-screen app (iPhone 16.4+ once added to the Home Screen, Android Chrome, desktop browsers).
 * A device subscribes from Settings → Notifications; its subscription (a push-service address and two keys, no
 * personal data) is kept server-only in push_subscriptions/<phone>/devices/<id>. Once a day, after 8:30 am India
 * time, each subscribed person gets what's due: cards with reminders on that are due within 3 days (or overdue),
 * and how many tasks are for today. The message itself travels encrypted to the device (the Web Push protocol).
 * Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and optionally VAPID_SUBJECT) in Vercel; without them nothing is sent and
 * the app says push isn't set up.
 */
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
export const vapidPublicKey = () => (process.env.VAPID_PUBLIC_KEY || '').trim();

let ready = false;
function init() {
  if (ready) return;
  webpush.setVapidDetails((process.env.VAPID_SUBJECT || 'mailto:alerts@alignplanner.vercel.app').trim(), vapidPublicKey(), (process.env.VAPID_PRIVATE_KEY || '').trim());
  ready = true;
}

const devices = (phone: string) => db.collection('push_subscriptions').doc(phone).collection('devices');
const idOf = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

/** A subscription from the browser, checked: an https push-service address and the two keys as strings. */
export function cleanSub(x: unknown): PushSub | null {
  const s = x as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\/[^\s]{10,1000}$/.test(s.endpoint)) return null;
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100 || !p256dh || !auth) return null;
  return { endpoint: s.endpoint, keys: { p256dh, auth } };
}

export async function saveSub(phone: string, sub: PushSub) {
  // The parent record exists so the daily run can list everyone subscribed (and note when it last sent)
  await db.collection('push_subscriptions').doc(phone).set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await devices(phone).doc(idOf(sub.endpoint)).set({ ...sub, createdAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function removeSub(phone: string, endpoint: string) {
  await devices(phone).doc(idOf(endpoint)).delete();
}

/** Sends to every device the person subscribed; dead subscriptions (gone/expired) are removed. Returns how many got it. */
export async function sendToUser(phone: string, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  init();
  const snap = await devices(phone).get();
  let delivered = 0;
  await Promise.all(snap.docs.map(async (d) => {
    const sub = cleanSub(d.data());
    if (!sub) return void d.ref.delete();
    try {
      await webpush.sendNotification(sub, JSON.stringify({ url: '/wallet', ...payload }), { TTL: 6 * 3600, urgency: 'normal' });
      delivered++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await d.ref.delete();
      else console.warn('Push not sent:', code || (e as Error).message);
    }
  }));
  return delivered;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** One notification per card with a reminder on that is due within 3 days or overdue up to a week; one for today's tasks. Pure. */
export function reminderPayloads(cards: CardSummary[], tasksToday: number, todayKey: string): PushPayload[] {
  const out: PushPayload[] = [];
  for (const c of cards
    .filter((x) => x.remind && !x.hidden && x.status !== 'paid' && x.outstanding > 0 && x.daysLeft !== null && x.daysLeft <= 3 && x.daysLeft >= -7)
    .sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0))) {
    const left = c.daysLeft as number;
    const when = left < 0 ? `overdue by ${-left} day${left === -1 ? '' : 's'}` : left === 0 ? 'due today' : left === 1 ? 'due tomorrow' : `due in ${left} days`;
    const name = `${c.issuerName}${c.last4 ? ` ••${c.last4}` : ''}`;
    const min = c.minDue && c.minDue < c.outstanding ? ` (minimum ${inr(c.minDue)})` : '';
    out.push({ title: `${name} ${when}`, body: `${inr(c.outstanding)} to pay${min}`, url: '/wallet', tag: `card-${c.key}-${todayKey}` });
  }
  if (tasksToday > 0) out.push({ title: `${tasksToday} task${tasksToday === 1 ? '' : 's'} today`, body: 'Open Align to see your agenda.', url: '/', tag: `tasks-${todayKey}` });
  return out;
}

/**
 * Once a day per subscribed person, from 8:30 am India time: their reminders. Called from the 15-minute scheduler
 * (sync-all), so it goes out soon after 8:30. `push_subscriptions/<phone>.lastSent` stops a second send that day.
 */
export async function runPushReminders(now = Date.now()): Promise<{ users: number; sent: number }> {
  if (!pushConfigured()) return { users: 0, sent: 0 };
  const ist = istParts(now);
  if (ist.time < '08:30') return { users: 0, sent: 0 };
  const snap = await db.collection('push_subscriptions').get();
  let users = 0;
  let sent = 0;
  for (const doc of snap.docs) {
    const phone = doc.id;
    if (doc.data().lastSent === ist.date) continue;
    users++;
    try {
      const [cards, tasks] = await Promise.all([
        cardSummaries(phone, now).catch(() => [] as CardSummary[]),
        db.collection('planner_items').where('ownerId', '==', phone).where('dueDate', '==', ist.date).get().then((s) => s.docs.filter((d) => { const x = d.data(); return x.type === 'task' && x.done !== true && x.kind !== 'card_bill'; }).length).catch(() => 0),
      ]);
      for (const p of reminderPayloads(cards, tasks, ist.date)) sent += await sendToUser(phone, p);
      await doc.ref.set({ lastSent: ist.date }, { merge: true });
    } catch (e) {
      console.warn('Push reminders skipped for one person:', (e as Error).message);
    }
  }
  return { users, sent };
}
