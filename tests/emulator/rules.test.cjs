// Firestore rules against the local emulator: `npm run test:emulator`. No real project is touched.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } = require('firebase/firestore');

const ALICE = '919999999999';
const BOB = '918888888888';
const variants = p => [p, p.slice(2), `+${p}`];
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-align',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'planner_items/a1'), { ownerId: ALICE, type: 'expense', amount: 250 });
    await setDoc(doc(db, 'planner_items/a2'), { ownerId: ALICE.slice(2), type: 'task' });
    await setDoc(doc(db, 'planner_items/b1'), { ownerId: BOB, type: 'expense', amount: 999 });
    await setDoc(doc(db, `planner_settings/preferences_${BOB}`), { theme: 'dark' });
    await setDoc(doc(db, `planner_settings/ingest_${'a'.repeat(64)}`), { phone: ALICE });
    await setDoc(doc(db, `user_sessions/${BOB}`), { history: ['secret'] });
    await setDoc(doc(db, 'users/g1'), { email: 'g1@example.com' });
    await setDoc(doc(db, 'rate_limits/x'), { count: 1 });
    await setDoc(doc(db, `auth_codes/${ALICE}`), { hash: 'h' });
  });
});

const alice = () => env.authenticatedContext(`wa_${ALICE}`, { phone: ALICE, phones: variants(ALICE) }).firestore();
const signedOut = () => env.unauthenticatedContext().firestore();

test('signed out: nothing can be read or written', async () => {
  const db = signedOut();
  await assertFails(getDoc(doc(db, 'planner_items/a1')));
  await assertFails(getDocs(collection(db, 'planner_items')));
  await assertFails(setDoc(doc(db, 'planner_items/new'), { ownerId: ALICE }));
  await assertFails(getDoc(doc(db, `planner_settings/preferences_${BOB}`)));
  await assertFails(setDoc(doc(db, `planner_settings/ingest_${'b'.repeat(64)}`), { phone: BOB }));
  await assertFails(setDoc(doc(db, `user_sessions/${BOB}`), { autoPushEnabled: true }));
});

test('items: owner reads and writes every spelling of their number; nobody else gets in', async () => {
  const db = alice();
  await assertSucceeds(getDoc(doc(db, 'planner_items/a1')));
  await assertSucceeds(getDoc(doc(db, 'planner_items/a2')));
  await assertSucceeds(getDocs(query(collection(db, 'planner_items'), where('ownerId', 'in', variants(ALICE)))));
  await assertSucceeds(setDoc(doc(db, 'planner_items/new'), { ownerId: ALICE, type: 'task' }));
  await assertSucceeds(updateDoc(doc(db, 'planner_items/a1'), { amount: 300 }));
  await assertSucceeds(deleteDoc(doc(db, 'planner_items/a2')));

  await assertFails(getDoc(doc(db, 'planner_items/b1')));
  await assertFails(getDocs(collection(db, 'planner_items')));
  await assertFails(getDocs(query(collection(db, 'planner_items'), where('ownerId', 'in', [ALICE, BOB]))));
  await assertFails(setDoc(doc(db, 'planner_items/forBob'), { ownerId: BOB }));
  await assertFails(updateDoc(doc(db, 'planner_items/a1'), { ownerId: BOB }));
  await assertFails(updateDoc(doc(db, 'planner_items/b1'), { amount: 1 }));
  await assertFails(deleteDoc(doc(db, 'planner_items/b1')));
});

test('settings: own preferences/budgets only; import keys can be made for yourself but never read', async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, `planner_settings/preferences_${ALICE}`), { theme: 'light' }));
  await assertSucceeds(setDoc(doc(db, `planner_settings/budgets_${ALICE.slice(2)}`), { MONTHLY: 1 }));
  await assertFails(getDoc(doc(db, `planner_settings/preferences_${BOB}`)));
  await assertFails(setDoc(doc(db, `planner_settings/budgets_${BOB}`), { MONTHLY: 1 }));

  await assertSucceeds(setDoc(doc(db, `planner_settings/ingest_${'c'.repeat(64)}`), { phone: ALICE }));
  await assertFails(setDoc(doc(db, `planner_settings/ingest_${'d'.repeat(64)}`), { phone: BOB }));
  await assertFails(getDoc(doc(db, `planner_settings/ingest_${'a'.repeat(64)}`)));
  await assertSucceeds(deleteDoc(doc(db, `planner_settings/ingest_${'a'.repeat(64)}`)));
});

test("import keys: nobody can take over someone else's", async () => {
  const key = `planner_settings/ingest_${'e'.repeat(64)}`;
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), key), { phone: BOB }); });
  // Alice can't repoint Bob's key at herself (or at anyone)
  await assertFails(setDoc(doc(alice(), key), { phone: ALICE }));
  await assertFails(deleteDoc(doc(alice(), key)));
});

test('feedback: send as yourself only; nobody reads it from the app', async () => {
  const { serverTimestamp } = require('firebase/firestore');
  await assertSucceeds(setDoc(doc(alice(), 'feedback/f1'), { text: 'Love it', userId: ALICE, createdAt: serverTimestamp(), platform: 'web' }));
  await assertFails(setDoc(doc(alice(), 'feedback/f2'), { text: 'Spoof', userId: BOB, createdAt: serverTimestamp(), platform: 'web' }));
  await assertFails(setDoc(doc(alice(), 'feedback/f3'), { text: 'x'.repeat(2001), userId: ALICE, createdAt: serverTimestamp(), platform: 'web' }));
  await assertFails(setDoc(doc(alice(), 'feedback/f4'), { text: 'Extra', userId: ALICE, createdAt: serverTimestamp(), platform: 'web', admin: true }));
  await assertFails(getDoc(doc(alice(), 'feedback/f1')));
  await assertFails(setDoc(doc(signedOut(), 'feedback/f5'), { text: 'Anon', userId: 'anonymous', createdAt: serverTimestamp(), platform: 'web' }));
});

test('WhatsApp sessions: own only', async () => {
  const db = alice();
  await assertSucceeds(setDoc(doc(db, `user_sessions/${ALICE}`), { autoPushEnabled: true }, { merge: true }));
  await assertFails(getDoc(doc(db, `user_sessions/${BOB}`)));
  await assertFails(setDoc(doc(db, `user_sessions/${BOB}`), { autoPushEnabled: false }, { merge: true }));
});

test('profiles: the app cannot set or change the verified phone', async () => {
  const g1 = env.authenticatedContext('g1').firestore();
  await assertSucceeds(getDoc(doc(g1, 'users/g1')));
  await assertSucceeds(updateDoc(doc(g1, 'users/g1'), { displayName: 'G' }));
  await assertFails(updateDoc(doc(g1, 'users/g1'), { phone: ALICE }));
  await assertFails(getDoc(doc(g1, 'users/g2')));
  const g2 = env.authenticatedContext('g2').firestore();
  await assertFails(setDoc(doc(g2, 'users/g2'), { phone: BOB }));
  await assertSucceeds(setDoc(doc(g2, 'users/g2'), { email: 'g2@example.com' }));
  // a Google user without a verified number sees no phone-owned data
  await assertFails(getDoc(doc(g1, 'planner_items/a1')));
});

test('server-only collections are closed to the app', async () => {
  const db = alice();
  await assertFails(getDoc(doc(db, 'rate_limits/x')));
  await assertFails(getDoc(doc(db, `auth_codes/${ALICE}`)));
  await assertFails(setDoc(doc(db, 'gmail_links/x'), { token: 't' }));
});
