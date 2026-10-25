// "Download my data", "Delete my account" and the "Couldn't read" list, against the local emulators: `npm run test:emulator`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';

const jiti = require('jiti')(__filename);
const { exportAccount, deleteAccount } = jiti(path.join(__dirname, '../../lib/accountData.ts'));
const { saveUnparsed, listUnparsed, dismissUnparsed } = jiti(path.join(__dirname, '../../lib/unparsed.ts'));
const { saveBalance } = jiti(path.join(__dirname, '../../lib/moneyAccounts.ts'));
const { db, adminAuth } = jiti(path.join(__dirname, '../../lib/firebase.ts'));

const ME = '919876500801';
const OTHER = '919876500802';

async function seed(phone, tag) {
  await db.collection('planner_items').doc(`${tag}-1`).set({ ownerId: phone, type: 'expense', title: `${tag} tea`, amount: 10 });
  await db.collection('planner_items').doc(`${tag}-2`).set({ ownerId: phone.slice(2), type: 'task', title: `${tag} task` });
  await db.collection('planner_settings').doc(`preferences_${phone}`).set({ dailySummaryEnabled: true });
  await db.collection('planner_settings').doc(`budgets_${phone}`).set({ monthly: 5000 });
  await db.collection('user_sessions').doc(phone).set({ lastSeen: 1 });
  await saveBalance(phone, { bankId: 'axis', bankName: 'Axis Bank', last4: '1111', balance: 900, at: Date.now() });
  await db.collection('gmail_links').doc(phone).set({ status: 'connected', email: `${tag}@example.com`, token: 'SECRET-TOKEN', statementPasswords: { hdfc: { sealed: 'SECRET-PW', v: 1 } }, banks: ['hdfc'] });
  await db.collection('gmail_links').doc(phone).collection('bills').doc('b1').set({ issuer: 'hdfc', totalDue: 1000, dueDate: '2026-11-01' });
  await db.collection('push_subscriptions').doc(phone).collection('devices').doc('d1').set({ endpoint: 'https://push.example.com/x' });
  await saveUnparsed(phone, { source: 'sms', text: 'Sent Rs.5 to SHOP ref 123456789012' });
}

test('download my data: everything of theirs, nothing of anyone else, and no secrets', async () => {
  await seed(ME, 'me');
  await seed(OTHER, 'other');
  const data = await exportAccount(ME);
  const text = JSON.stringify(data);
  assert.deepEqual(data.items.map((i) => i.id).sort(), ['me-1', 'me-2'], 'both spellings of their number, and only theirs');
  assert.equal(data.settings.preferences.dailySummaryEnabled, true);
  assert.equal(data.settings.budgets.monthly, 5000);
  assert.equal(data.money.accounts[0].balance, 900, 'balances are included');
  assert.equal(data.gmail.bills[0].totalDue, 1000);
  assert.ok(!text.includes('SECRET-TOKEN') && !text.includes('SECRET-PW'), 'the Gmail key and statement passwords never leave');
  assert.ok(!text.includes('other tea'), 'nothing of another person');
});

test('delete my account: all of it is gone, the sign-in too, and another person is untouched', async () => {
  const uid = `wa_${ME}`;
  await adminAuth().createUser({ uid }).catch(() => {});
  await db.collection('users').doc(uid).set({ phone: ME });
  const done = await deleteAccount(ME, uid);
  assert.equal(done.items, 2);

  assert.equal((await db.collection('planner_items').where('ownerId', 'in', [ME, ME.slice(2)]).get()).size, 0);
  for (const id of [`preferences_${ME}`, `budgets_${ME}`]) assert.equal((await db.collection('planner_settings').doc(id).get()).exists, false);
  assert.equal((await db.collection('user_sessions').doc(ME).get()).exists, false);
  assert.equal((await db.collection('gmail_links').doc(ME).get()).exists, false);
  assert.equal((await db.collection('gmail_links').doc(ME).collection('bills').get()).size, 0);
  assert.equal((await db.collection('money_accounts').doc(ME).collection('accounts').get()).size, 0);
  assert.equal((await db.collection('money_accounts').doc(ME).collection('unparsed').get()).size, 0);
  assert.equal((await db.collection('push_subscriptions').doc(ME).collection('devices').get()).size, 0);
  assert.equal((await db.collection('users').doc(uid).get()).exists, false);
  await assert.rejects(adminAuth().getUser(uid), 'the sign-in itself is removed');

  // The other person keeps everything
  assert.equal((await db.collection('planner_items').where('ownerId', '==', OTHER).get()).size, 1);
  assert.equal((await exportAccount(OTHER)).items.length, 2);
  assert.equal((await db.collection('gmail_links').doc(OTHER).get()).exists, true);
});

test('the "Couldn\'t read" list: kept masked, de-duplicated, dismissible, and expires after 30 days', async () => {
  const P = '919876500803';
  await saveUnparsed(P, { source: 'sms', text: 'Sent Rs.250 from A/c 1234567890 to SHOP ref 627574346774', bank: 'Indian Bank' });
  await saveUnparsed(P, { source: 'sms', text: 'Sent Rs.250 from A/c 1234567890 to SHOP ref 627574346774', bank: 'Indian Bank' });
  await saveUnparsed(P, { source: 'email', bank: 'HDFC Bank', text: 'the email text must not be kept' });
  let list = await listUnparsed(P);
  assert.equal(list.length, 2, 'the same message twice in the same hour is one');
  const sms = list.find((x) => x.source === 'sms');
  const mail = list.find((x) => x.source === 'email');
  assert.equal(sms.preview, 'Sent Rs.250 from A/c •••••••••• to SHOP ref ••••••••••••');
  assert.equal(mail.preview, null, 'an email keeps only its bank and day');
  assert.ok(!JSON.stringify(list).includes('1234567890') && !JSON.stringify(list).includes('email text'));

  await dismissUnparsed(P, sms.id);
  assert.equal((await listUnparsed(P)).length, 1);
  await saveUnparsed(P, { source: 'sms', text: 'Rs.9 sent to OLD', at: Date.now() - 40 * 86400000 });
  assert.equal((await listUnparsed(P)).length, 1, 'older than 30 days is dropped');
  await dismissUnparsed(P, 'all');
  assert.equal((await listUnparsed(P)).length, 0);
});
