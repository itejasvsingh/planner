// Web push: subscriptions, the daily reminders, dead subscriptions removed. `npm run test:emulator`. Nothing is really sent.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

const sent = [];
let failWith = null;
webpush.sendNotification = async (sub, payload) => { if (failWith) { const e = new Error('gone'); e.statusCode = failWith; throw e; } sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); };

const jiti = require('jiti')(__filename);
const push = jiti(path.join(__dirname, '../../lib/webPush.ts'));
const { saveBill } = jiti(path.join(__dirname, '../../lib/cardBills.ts'));
const { saveCardEdit } = jiti(path.join(__dirname, '../../lib/moneyAccounts.ts'));
const { istParts } = jiti(path.join(__dirname, '../../lib/recordTransaction.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));

const P = '919800000501';
const sub = (n) => ({ endpoint: `https://push.example.com/send/${n}-abcdefghij`, keys: { p256dh: 'BPubKey' + n, auth: 'auth' + n } });
const DAY = 86400000;

test('a subscription is checked, kept per device and removed on request', async () => {
  assert.equal(push.cleanSub({ endpoint: 'http://insecure.example.com/x', keys: { p256dh: 'a', auth: 'b' } }), null, 'https only');
  assert.equal(push.cleanSub({ endpoint: sub(1).endpoint, keys: { p256dh: 'a' } }), null, 'both keys');
  assert.deepEqual(push.cleanSub(sub(1)), sub(1));
  await push.saveSub(P, sub(1));
  await push.saveSub(P, sub(2));
  await push.saveSub(P, sub(1)); // the same device again: still one
  assert.equal((await db.collection('push_subscriptions').doc(P).collection('devices').get()).size, 2);
  await push.removeSub(P, sub(2).endpoint);
  assert.equal((await db.collection('push_subscriptions').doc(P).collection('devices').get()).size, 1);
});

test('reminders: a card due soon (reminder on), an overdue one, and today’s tasks; nothing for paid, hidden or far-off cards', () => {
  const card = (o) => ({ key: 'k', issuerName: 'HDFC Bank', last4: '1234', outstanding: 2051, minDue: 435, remind: true, hidden: false, status: 'due', daysLeft: 1, ...o });
  const out = push.reminderPayloads([
    card({ key: 'a', daysLeft: 1 }),
    card({ key: 'b', issuerName: 'Axis Bank', last4: '5678', daysLeft: -2, status: 'overdue', outstanding: 7000, minDue: 350 }),
    card({ key: 'c', daysLeft: 9 }), card({ key: 'd', status: 'paid' }), card({ key: 'e', hidden: true }), card({ key: 'f', remind: false }), card({ key: 'g', outstanding: 0 }),
  ], 3, '2026-10-24');
  assert.deepEqual(out.map((p) => [p.title, p.body]), [
    ['Axis Bank ••5678 overdue by 2 days', '₹7,000 to pay (minimum ₹350)'],
    ['HDFC Bank ••1234 due tomorrow', '₹2,051 to pay (minimum ₹435)'],
    ['3 tasks today', 'Open Align to see your agenda.'],
  ]);
  assert.deepEqual(push.reminderPayloads([], 0, '2026-10-24'), []);
});

test('the daily run sends once a day after 8:30 am India time, for cards with reminders on', async () => {
  const stmtAt = Date.now() - 10 * DAY;
  await saveBill(P, { totalDue: 3000, minDue: 150, dueDate: istParts(Date.now() + 1 * DAY).date, last4: '4321' }, 'creditcards@hdfcbank.net', stmtAt);
  await saveCardEdit(P, 'hdfc_4321', { remind: true });
  await db.collection('planner_items').doc('tk1').set({ ownerId: P, type: 'task', title: 'Pay rent', dueDate: istParts(Date.now()).date, done: false });

  const early = Date.parse(`${istParts(Date.now()).date}T08:00:00+05:30`);
  assert.deepEqual(await push.runPushReminders(early), { users: 0, sent: 0 }, 'before 8:30');
  sent.length = 0;
  const morning = Date.parse(`${istParts(Date.now()).date}T09:00:00+05:30`);
  const r = await push.runPushReminders(morning);
  assert.equal(r.users >= 1, true);
  const mine = sent.map((s) => s.payload.title);
  assert.ok(mine.includes('HDFC Bank ••4321 due tomorrow') || mine.some((t) => /HDFC Bank ••4321/.test(t)), `card reminder sent: ${mine}`);
  assert.ok(mine.includes('1 task today'));
  const before = sent.length;
  await push.runPushReminders(morning + 60_000);
  assert.equal(sent.length, before, 'not a second time the same day');
});

test('a gone subscription (404/410) is forgotten; other failures keep it', async () => {
  await push.saveSub(P, sub(3));
  failWith = 503;
  assert.equal(await push.sendToUser(P, { title: 't', body: 'b' }), 0);
  assert.equal((await db.collection('push_subscriptions').doc(P).collection('devices').get()).size, 2, 'kept after a temporary failure');
  failWith = 410;
  await push.sendToUser(P, { title: 't', body: 'b' });
  assert.equal((await db.collection('push_subscriptions').doc(P).collection('devices').get()).size, 0, 'both removed once the push service says they are gone');
  failWith = null;
});

test('not configured: nothing is sent', async () => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  process.env.VAPID_PUBLIC_KEY = '';
  assert.equal(push.pushConfigured(), false);
  assert.equal(await push.sendToUser(P, { title: 't', body: 'b' }), 0);
  assert.deepEqual(await push.runPushReminders(), { users: 0, sent: 0 });
  process.env.VAPID_PUBLIC_KEY = pub;
});
