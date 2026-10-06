// One payment arriving by SMS, email and Gmail is recorded once: `npm run test:emulator`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';

const jiti = require('jiti')(__filename);
const { recordTransaction } = jiti(path.join(__dirname, '../../lib/recordTransaction.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));

const tx = (o = {}) => ({ type: 'expense', amount: 20, merchant: 'Isthara Parks', category: 'Other', ref: null, date: null, ...o });
const count = async phone => (await db.collection('planner_items').where('ownerId', '==', phone).get()).size;

test('same reference from SMS and Gmail: one transaction', async () => {
  const P = '919800000001';
  assert.equal(await recordTransaction(P, tx({ ref: '627574346774' }), { source: 'sms', dedupText: 'sms text', date: '2026-10-02' }), 'added');
  assert.equal(await recordTransaction(P, tx({ ref: '627574346774' }), { source: 'gmail', dedupText: 'gmail:abc', date: '2026-10-02' }), 'duplicate');
  assert.equal(await count(P), 1);
});

test('SMS without a reference, email with one, a day apart around midnight: one transaction', async () => {
  const P = '919800000002';
  assert.equal(await recordTransaction(P, tx(), { source: 'sms', dedupText: 'Rs 20 debited…', date: '2026-10-02' }), 'added');
  assert.equal(await recordTransaction(P, tx({ ref: '627574346774' }), { source: 'gmail', dedupText: 'gmail:def', date: '2026-10-03' }), 'duplicate');
  // and the other way round
  const Q = '919800000003';
  assert.equal(await recordTransaction(Q, tx({ ref: '627574346775' }), { source: 'gmail', dedupText: 'gmail:ghi', date: '2026-10-02' }), 'added');
  assert.equal(await recordTransaction(Q, tx(), { source: 'sms', dedupText: 'Rs 20 debited', date: '2026-10-02' }), 'duplicate');
  assert.equal(await recordTransaction(Q, tx(), { source: 'email', dedupText: 'script email', date: '2026-10-02' }), 'duplicate', 'Gmail script too');
  assert.equal(await count(P) + await count(Q), 2);
});

test('genuinely separate payments are all kept', async () => {
  const P = '919800000004';
  // two ₹20 teas on the same day by SMS (same source, different messages)
  assert.equal(await recordTransaction(P, tx(), { source: 'sms', dedupText: 'tea one 10:01', date: '2026-10-02' }), 'added');
  assert.equal(await recordTransaction(P, tx(), { source: 'sms', dedupText: 'tea two 16:40', date: '2026-10-02' }), 'added');
  // an SMS and an email with different references are different payments
  assert.equal(await recordTransaction(P, tx({ amount: 99, ref: '111111111111' }), { source: 'sms', dedupText: 'a', date: '2026-10-02' }), 'added');
  assert.equal(await recordTransaction(P, tx({ amount: 99, ref: '222222222222' }), { source: 'gmail', dedupText: 'gmail:x', date: '2026-10-02' }), 'added');
  // same amount but money in, not out
  assert.equal(await recordTransaction(P, tx({ type: 'income' }), { source: 'gmail', dedupText: 'gmail:y', date: '2026-10-02' }), 'added');
  // three days apart is not the same payment
  assert.equal(await recordTransaction(P, tx(), { source: 'gmail', dedupText: 'gmail:z', date: '2026-10-05' }), 'added');
  assert.equal(await count(P), 6);
});

test('a transaction typed in by hand is not treated as an automatic duplicate (statement import asks instead)', async () => {
  const P = '919800000005';
  await db.collection('planner_items').doc('manual1').set({ ownerId: P, type: 'expense', amount: 20, date: '2026-10-02', title: 'Tea' });
  assert.equal(await recordTransaction(P, tx(), { source: 'sms', dedupText: 'Rs 20', date: '2026-10-02' }), 'added');
});

test('a merchant you categorised keeps that category on new transactions from any source', async () => {
  const P = '919800000006';
  await db.collection('planner_settings').doc(`preferences_${P}`).set({ expenseCategories: { merchants: { 'isthara parks': 'Food & Dining' } } });
  await recordTransaction(P, tx({ merchant: 'Isthara Parks', category: 'Other', ref: '627574346774' }), { source: 'gmail', dedupText: 'g', date: '2026-10-02' });
  await recordTransaction(P, tx({ merchant: 'ISTHARA PARKS PRIVATE LIMITED', category: 'Other', amount: 45 }), { source: 'sms', dedupText: 's', date: '2026-10-04' });
  await recordTransaction(P, tx({ merchant: 'Zomato', category: 'Food & Dining', amount: 300 }), { source: 'sms', dedupText: 'z', date: '2026-10-04' });
  const got = (await db.collection('planner_items').where('ownerId', '==', P).get()).docs.map(d => d.data()).sort((a, b) => a.amount - b.amount);
  assert.deepEqual(got.map(i => [i.amount, i.category, i.tags[0]]), [[20, 'Food & Dining', 'Food & Dining'], [45, 'Food & Dining', 'Food & Dining'], [300, 'Food & Dining', 'Food & Dining']]);
  // changing it again moves future ones
  await db.collection('planner_settings').doc(`preferences_${P}`).set({ expenseCategories: { merchants: { 'isthara parks': 'Groceries' } } });
  await recordTransaction(P, tx({ merchant: 'Isthara Parks', category: 'Other', amount: 70 }), { source: 'gmail', dedupText: 'g2', date: '2026-10-06' });
  const latest = (await db.collection('planner_items').where('ownerId', '==', P).where('amount', '==', 70).get()).docs[0].data();
  assert.equal(latest.category, 'Groceries');
});

test('a payment you split with friends is still recognised when the same debit arrives again', async () => {
  const P = '919800000007';
  assert.equal(await recordTransaction(P, tx({ amount: 1200 }), { source: 'sms', dedupText: 'dinner 1200', date: '2026-10-02' }), 'added');
  const [doc] = (await db.collection('planner_items').where('ownerId', '==', P).get()).docs;
  // The user splits it three ways in the app: amount becomes their share
  await doc.ref.update({ amount: 400, split: { total: 1200, paidBy: 'you', method: 'equal', yourShare: 400, people: [{ name: 'A', share: 400 }, { name: 'B', share: 400 }] } });
  assert.equal(await recordTransaction(P, tx({ amount: 1200, ref: '999988887777' }), { source: 'gmail', dedupText: 'gmail:split', date: '2026-10-02' }), 'duplicate');
  assert.equal(await count(P), 1);
});

test('money to family or your own account is a transfer, not spending, and stays one transaction', async () => {
  const P = '919800000008';
  await db.collection('planner_settings').doc(`preferences_${P}`).set({ expenseCategories: { transferMerchants: { 'sunita singh': 'Family' } } });
  await recordTransaction(P, tx({ merchant: 'Sunita Singh', amount: 5000 }), { source: 'sms', dedupText: 'mom', date: '2026-10-02' });
  await recordTransaction(P, tx({ merchant: 'Tejasv', amount: 20000 }), { source: 'sms', dedupText: 'self', date: '2026-10-02', text: 'Rs 20000 transferred to self a/c XX1234 via IMPS' });
  await recordTransaction(P, tx({ merchant: 'Zomato', amount: 300 }), { source: 'sms', dedupText: 'z', date: '2026-10-02' });
  // the Gmail alert for Mom's transfer arrives too: still one
  assert.equal(await recordTransaction(P, tx({ merchant: 'SUNITA SINGH', amount: 5000 }), { source: 'gmail', dedupText: 'gmail:mom', date: '2026-10-02' }), 'duplicate');
  const got = (await db.collection('planner_items').where('ownerId', '==', P).get()).docs.map(d => d.data()).sort((a, b) => a.amount - b.amount);
  assert.deepEqual(got.map(i => [i.amount, i.type, i.category]), [[300, 'expense', 'Other'], [5000, 'transfer', 'Family'], [20000, 'transfer', 'Self Transfer']]);
});

test('a transaction deleted in the app is not added again by any later sync', async () => {
  const P = '919800000009';
  assert.equal(await recordTransaction(P, tx({ ref: '555566667777' }), { source: 'gmail', dedupText: 'gmail:del1', date: '2026-10-02' }), 'added');
  assert.equal(await recordTransaction(P, tx({ amount: 75 }), { source: 'sms', dedupText: 'sms 75', date: '2026-10-02' }), 'added');
  // What the app's delete does for automatic transactions (use-planner-items deleteItem)
  for (const d of (await db.collection('planner_items').where('ownerId', '==', P).get()).docs) {
    await d.ref.update({ type: 'deleted', deletedType: d.data().type, deletedAt: '2026-10-03T00:00:00.000Z' });
  }
  // same Gmail message again, the SMS for it, the statement row for it, and the 75 again by Gmail
  assert.equal(await recordTransaction(P, tx({ ref: '555566667777' }), { source: 'gmail', dedupText: 'gmail:del1', date: '2026-10-02' }), 'duplicate');
  assert.equal(await recordTransaction(P, tx({ ref: '555566667777' }), { source: 'sms', dedupText: 'Rs 20 ref 555566667777', date: '2026-10-02' }), 'duplicate');
  assert.equal(await recordTransaction(P, tx(), { source: 'statement', dedupText: 'statement:x', date: '2026-10-02' }), 'duplicate');
  assert.equal(await recordTransaction(P, tx({ amount: 75 }), { source: 'gmail', dedupText: 'gmail:75', date: '2026-10-02' }), 'duplicate');
  assert.equal(await recordTransaction(P, tx({ amount: 75 }), { source: 'sms', dedupText: 'sms 75', date: '2026-10-02' }), 'duplicate');
  const live = (await db.collection('planner_items').where('ownerId', '==', P).get()).docs.filter(d => d.data().type !== 'deleted');
  assert.equal(live.length, 0);
});
