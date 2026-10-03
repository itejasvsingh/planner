// Midnight auto-push on the server: `npm run test:emulator`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';

const jiti = require('jiti')(__filename);
const { runTaskRolloverForUser } = jiti(path.join(__dirname, '../../lib/taskRollover.ts'));
const { getKolkataDateInfo } = jiti(path.join(__dirname, '../../lib/dailySummary.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));

const seed = async (P) => {
  await db.doc('planner_items/r1_' + P).set({ ownerId: P, type: 'task', title: 'Old', done: false, dueDate: '2026-09-20' });
  await db.doc('planner_items/r2_' + P).set({ ownerId: P, type: 'task', title: 'Bill', done: false, dueDate: '2026-09-20', kind: 'card_bill' });
};

test('nothing moves for someone who never turned auto-push on', async () => {
  const P = '919800000201';
  await seed(P);
  const r = await runTaskRolloverForUser(P);
  assert.equal(r.rolledOverCount, 0);
  assert.equal((await db.doc('planner_items/r1_' + P).get()).data().dueDate, '2026-09-20');
});

test('with auto-push on, overdue tasks move to today (card bills stay)', async () => {
  const P = '919800000202';
  await seed(P);
  await db.doc(`planner_settings/preferences_${P}`).set({ autoPushEnabled: true });
  const r = await runTaskRolloverForUser(P);
  assert.equal(r.rolledOverCount, 1);
  const moved = (await db.doc('planner_items/r1_' + P).get()).data();
  assert.deepEqual([moved.dueDate, moved.rolledOverFrom], [getKolkataDateInfo().todayKey, '2026-09-20']);
  assert.equal((await db.doc('planner_items/r2_' + P).get()).data().dueDate, '2026-09-20');
});
