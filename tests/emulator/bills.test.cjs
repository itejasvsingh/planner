// Credit card bill reminders from Gmail: `npm run test:emulator`. Google and WhatsApp are simulated.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
process.env.GOOGLE_OAUTH_CLIENT_ID = '123456789012-testclient.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
process.env.GMAIL_TOKEN_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.WHATSAPP_API_TOKEN = 'wa-token';
process.env.WHATSAPP_PHONE_ID = 'wa-phone';

const DAY = 86400000;
const b64 = s => Buffer.from(s, 'utf8').toString('base64url');
const ist = ms => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const dueKey = ist(Date.now() + 2 * DAY);
const [y, m, d] = dueKey.split('-');
const mailbox = [
  { id: 'b1', from: 'creditcards@hdfcbank.net', internalDate: String(Date.now() - 5 * DAY), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Your HDFC Bank Credit Card Statement' }, { name: 'From', value: 'HDFC Bank <creditcards@hdfcbank.net>' }], body: { data: b64(`Dear Customer, the statement for your HDFC Bank Credit Card ending 4321 is attached.\nTotal Amount Due: Rs. 12,450.50\nMinimum Amount Due: Rs. 630.00\nPayment Due Date: ${d}/${m}/${y}`) } } },
];
const whatsapp = [];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(opts.body);
    if (form.get('grant_type') === 'authorization_code') return json({ access_token: 'a', refresh_token: 'r', scope: 'openid email https://www.googleapis.com/auth/gmail.readonly', id_token: ['x', b64('{"email":"me@gmail.com"}'), 'y'].join('.') });
    return json({ access_token: 'a2' });
  }
  if (u.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
    const q = new URL(u).searchParams.get('q');
    const after = Number((q.match(/after:(\d+)/) || [])[1] || 0);
    const before = Number((q.match(/before:(\d+)/) || [])[1] || Infinity);
    const senders = ((q.match(/from:\(([^)]*)\)/) || [])[1] || '').split(' OR ');
    const hits = mailbox.filter(x => senders.some(s => x.from.endsWith(`@${s}`)) && Number(x.internalDate) / 1000 >= after && Number(x.internalDate) / 1000 < before);
    return json({ messages: hits.reverse().map(x => ({ id: x.id })) });
  }
  const mm = u.match(/\/messages\/(\w+)\?format=full$/);
  if (mm) return json(mailbox.find(x => x.id === mm[1]));
  if (u.startsWith('https://graph.facebook.com/')) {
    whatsapp.push(JSON.parse(opts.body));
    return json({ messages: [{ id: 'w' }] });
  }
  return realFetch(url, opts);
};

const jiti = require('jiti')(__filename);
const gmail = jiti(path.join(__dirname, '../../lib/gmail.ts'));
const bills = jiti(path.join(__dirname, '../../lib/cardBills.ts'));
const { runDailySummaryForUser } = jiti(path.join(__dirname, '../../lib/dailySummary.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));

const PHONE = '919800000101';
const tasks = async () => (await db.collection('planner_items').where('ownerId', '==', PHONE).where('kind', '==', 'card_bill').get()).docs.map(x => x.data());

test('a statement email becomes a bill, but no reminder until the user says yes', async () => {
  await gmail.finishConnect('c1', new URL(await gmail.startConnect(PHONE, 'web')).searchParams.get('state'));
  const r = await gmail.syncGmail(PHONE, Date.now() + 20000);
  assert.equal(r.bills, 1);
  const found = await bills.upcomingBills(PHONE);
  assert.equal(found.length, 1);
  assert.deepEqual([found[0].issuerName, found[0].last4, found[0].totalDue, found[0].minDue, found[0].dueDate], ['HDFC Bank', '4321', 12450.5, 630, dueKey]);
  assert.deepEqual(await tasks(), [], 'nothing in the Agenda before confirmation');
  const items = (await db.collection('planner_items').where('ownerId', '==', PHONE).get()).size;
  assert.equal(items, 0, 'a statement is not an expense');
});

test('after "Yes, remind me" the bill is an Agenda task that keeps its due date', async () => {
  const r = await bills.setBillReminders(PHONE, true);
  assert.equal(r.created, 1);
  const [t] = await tasks();
  assert.equal(t.title, 'Pay HDFC Bank card ••4321 · ₹12,450.50');
  assert.deepEqual([t.type, t.dueDate, t.reminderTime, t.done, t.priority], ['task', dueKey, '10:00', false, 'high']);
  await bills.setBillReminders(PHONE, true);
  assert.equal((await tasks()).length, 1, 'saying yes again does not duplicate');
});

test('the nightly WhatsApp summary mentions the bill due in 2 days', async () => {
  const res = await runDailySummaryForUser(PHONE, { force: true });
  assert.equal(res.success, true);
  const text = whatsapp[whatsapp.length - 1].text.body;
  assert.match(text, /💳 \*Card bills:\*/);
  assert.match(text, /HDFC Bank ••4321: ₹12,450\.50 to pay \(min ₹630\), due in 2 days/);
  assert.deepEqual(bills.billReminderLines([{ kind: 'card_bill', done: false, dueDate: '2026-10-10', title: 'X' }], '2026-10-01'), [], 'not yet: more than 3 days out');
  assert.deepEqual(bills.billReminderLines([{ kind: 'card_bill', done: false, dueDate: '2026-09-29', title: 'X' }], '2026-10-01'), ['  • X — *overdue by 2 days*']);
});

test('the card payment confirmation ticks the bill off and is not counted as income', async () => {
  mailbox.push({ id: 'b2', from: 'creditcards@hdfcbank.net', internalDate: String(Date.now() - 60000), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Payment received' }, { name: 'From', value: 'creditcards@hdfcbank.net' }], body: { data: b64('Dear Customer, thank you for your payment of Rs 12,450.50 towards your HDFC Bank Credit Card ending 4321. The amount has been credited.') } } });
  await db.collection('gmail_links').doc(PHONE).update({ syncingSince: null });
  await gmail.syncGmail(PHONE, Date.now() + 20000);
  const [t] = await tasks();
  assert.equal(t.done, true);
  const income = (await db.collection('planner_items').where('ownerId', '==', PHONE).where('type', '==', 'income').get()).size;
  assert.equal(income, 0);
});

test('"No thanks" creates nothing', async () => {
  const P = '919800000102';
  await gmail.finishConnect('c2', new URL(await gmail.startConnect(P, 'web')).searchParams.get('state'));
  mailbox.splice(1);
  await gmail.syncGmail(P, Date.now() + 20000);
  await bills.setBillReminders(P, false);
  assert.equal((await db.collection('planner_items').where('ownerId', '==', P).where('kind', '==', 'card_bill').get()).size, 0);
});
