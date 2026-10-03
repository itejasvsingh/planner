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
