// Email sign-in (the backup for WhatsApp) against the local emulators: `npm run test:emulator`. No real email is sent.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';

// WhatsApp codes are captured too (linking a real number to an email account)
process.env.WHATSAPP_API_TOKEN = 'test-token';
process.env.WHATSAPP_PHONE_ID = 'test-phone-id';
delete process.env.WHATSAPP_AUTH_TEMPLATE;
const waSent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://graph.facebook.com/')) { waSent.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ messages: [{ id: 'wamid.t' }] }), { status: 200 }); }
  return realFetch(url, opts);
};
const waCode = () => waSent[waSent.length - 1].text.body.match(/\d{6}/)[0];

const mails = [];
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async (m) => { mails.push(m); } });
const lastCode = () => mails[mails.length - 1].text.match(/\b(\d{6})\b/)[1];

const jiti = require('jiti')(__filename);
const auth = jiti(path.join(__dirname, '../../lib/emailAuth.ts'));
const { startPhoneLogin, verifyPhoneLogin } = jiti(path.join(__dirname, '../../lib/phoneAuth.ts'));
const { mergeAccounts, isStandIn } = jiti(path.join(__dirname, '../../lib/accountLink.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithCustomToken, signOut } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, collection, query, where, getDocs } = require('firebase/firestore');
const [fsHost, fsPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const app = initializeApp({ projectId: 'demo-align', apiKey: 'demo-key' }, 'email-client');
const cauth = getAuth(app);
connectAuthEmulator(cauth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
const cdb = getFirestore(app);
connectFirestoreEmulator(cdb, fsHost, Number(fsPort));

test('not set up: it says so and sends nothing', async () => {
  delete process.env.SMTP_HOST;
  const r = await auth.startEmailLogin('friend@example.com', '10.1.0.1');
  assert.deepEqual([r.status, r.http], ['error', 503]);
  assert.equal(mails.length, 0);
});

test('a code is emailed, the right one signs in with a stand-in number, the same one every time, and only their own data is visible', async () => {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_USER = 'sender@example.com';
  process.env.SMTP_PASS = 'not-a-real-password';

  assert.equal((await auth.startEmailLogin('not an email', '10.1.0.2')).http, 400);
  assert.deepEqual(await auth.startEmailLogin(' Friend@Example.com ', '10.1.0.2'), { status: 'sent' });
  assert.equal(mails[0].to, 'friend@example.com', 'the address is tidied');
  const stored = (await db.collection('auth_codes').get()).docs.map((d) => JSON.stringify(d.data())).join('');
  assert.ok(!stored.includes(lastCode()), 'only a hash of the code is kept');

  assert.equal((await auth.verifyEmailLogin('friend@example.com', lastCode() === '000000' ? '111111' : '000000')).status, 'error');
  const ok = await auth.verifyEmailLogin('FRIEND@example.com', lastCode());
  assert.equal(ok.status, 'ok');
  assert.match(ok.phone, /^910\d{9}$/, 'a stand-in number no real mobile can have');
  assert.notEqual((await auth.verifyEmailLogin('friend@example.com', lastCode())).status, 'ok', 'a code works once');

  const cred = await signInWithCustomToken(cauth, ok.token);
  const claims = (await cred.user.getIdTokenResult()).claims;
  assert.deepEqual([claims.phone, claims.loginEmail], [ok.phone, 'friend@example.com']);

  await db.collection('planner_items').doc('em-own').set({ ownerId: ok.phone, type: 'expense', amount: 7 });
  await db.collection('planner_items').doc('em-other').set({ ownerId: '919876500777', type: 'expense', amount: 99 });
  const own = await getDocs(query(collection(cdb, 'planner_items'), where('ownerId', 'in', claims.phones)));
  assert.deepEqual(own.docs.map((d) => d.id), ['em-own']);
  await assert.rejects(getDoc(doc(cdb, 'planner_items', 'em-other')));
  await signOut(cauth);

  // Next time: same email, same number (one account); another email gets another number
  await auth.startEmailLogin('friend@example.com', '10.1.0.3').catch(() => {});
  await db.collection('auth_codes').get().then((s) => Promise.all(s.docs.map((d) => d.ref.update({ sentAt: 0 }))));
  await auth.startEmailLogin('friend@example.com', '10.1.0.3');
  const again = await auth.verifyEmailLogin('friend@example.com', lastCode());
  assert.equal(again.phone, ok.phone);
  await auth.startEmailLogin('second@example.com', '10.1.0.4');
  const second = await auth.verifyEmailLogin('second@example.com', lastCode());
  assert.notEqual(second.phone, ok.phone);
});

test('wrong tries lock the code; a resend waits; too many requests are refused', async () => {
  await auth.startEmailLogin('locky@example.com', '10.1.0.5');
  const real = lastCode();
  for (let i = 0; i < 5; i++) await auth.verifyEmailLogin('locky@example.com', real === '999999' ? '888888' : '999999');
  const locked = await auth.verifyEmailLogin('locky@example.com', real);
  assert.equal(locked.http, 429, 'five wrong tries lock even the right code');
  const soon = await auth.startEmailLogin('locky@example.com', '10.1.0.5');
  assert.equal(soon.http, 429, 'a second request within 30 seconds waits');
});

const emailSignIn = async (email, ip) => {
  await db.collection('auth_codes').get().then((x) => Promise.all(x.docs.map((d) => d.ref.update({ sentAt: 0 }))));
  assert.equal((await auth.startEmailLogin(email, ip)).status, 'sent');
  const r = await auth.verifyEmailLogin(email, lastCode());
  assert.equal(r.status, 'ok');
  const cred = await signInWithCustomToken(cauth, r.token);
  return { phone: r.phone, idToken: await cred.user.getIdToken(), uid: cred.user.uid };
};

test('an email account that adds its WhatsApp number brings its data along, and email then opens the same account', async () => {
  const { phone: S, idToken } = await emailSignIn('mover@example.com', '10.2.0.1');
  assert.ok(isStandIn(S));
  const R = '919876500321';
  // Data filed under the stand-in: an expense, settings, a card edit and a balance
  await db.collection('planner_items').doc('mv1').set({ ownerId: S, type: 'expense', amount: 10, title: 'Tea' });
  await db.collection('planner_items').doc('mv2').set({ ownerId: S, type: 'task', title: 'Pay rent' });
  await db.collection('planner_settings').doc(`preferences_${S}`).set({ dailySummaryEnabled: true, autoPushEnabled: true });
  await db.collection('money_accounts').doc(S).collection('accounts').doc('axis_1111').set({ bankId: 'axis', balance: 500 });
  await db.collection('money_accounts').doc(S).collection('accounts').doc('axis_1111').collection('history').doc('2026-10-01').set({ balance: 400 });
  // The real number already had a little of its own: its settings must win, its other things stay
  await db.collection('planner_items').doc('mv3').set({ ownerId: R, type: 'expense', amount: 99, title: 'Existing' });
  await db.collection('planner_settings').doc(`preferences_${R}`).set({ dailySummaryEnabled: false });

  // Prove the number with the WhatsApp code, signed in as the email account: this links it
  await db.collection('auth_codes').doc(R).delete().catch(() => {});
  assert.equal((await startPhoneLogin(R.slice(2), '10.2.0.2')).status, 'sent');
  const linked = await verifyPhoneLogin(R, waCode(), idToken);
  assert.deepEqual(linked, { status: 'linked', phone: R });

  const items = (await db.collection('planner_items').where('ownerId', '==', R).get()).docs.map((d) => d.id).sort();
  assert.deepEqual(items, ['mv1', 'mv2', 'mv3'], 'the email account’s items now belong to the real number, next to what it had');
  assert.equal((await db.collection('planner_items').where('ownerId', '==', S).get()).size, 0);
  const prefs = (await db.collection('planner_settings').doc(`preferences_${R}`).get()).data();
  assert.deepEqual([prefs.dailySummaryEnabled, prefs.autoPushEnabled], [false, true], 'the real number’s settings win; the other fills the gap');
  assert.equal((await db.collection('planner_settings').doc(`preferences_${S}`).get()).exists, false);
  assert.equal((await db.collection('money_accounts').doc(R).collection('accounts').doc('axis_1111').get()).data().balance, 500, 'balances moved');
  assert.equal((await db.collection('money_accounts').doc(R).collection('accounts').doc('axis_1111').collection('history').doc('2026-10-01').get()).exists, true, 'with their history');
  assert.equal((await db.collection('money_accounts').doc(S).collection('accounts').get()).size, 0, 'nothing left under the stand-in');

  // Next time, the email opens the real number's account
  const again = await emailSignIn('mover@example.com', '10.2.0.3');
  assert.equal(again.phone, R);
  assert.equal(isStandIn(again.phone), false);
  await signOut(cauth);
});

test('a WhatsApp-number account that adds an email: that email opens the same account; an email owned by another number is refused', async () => {
  const R = '919876500322';
  const token = await (jiti(path.join(__dirname, '../../lib/firebase.ts')).adminAuth)().createCustomToken(`wa_${R}`, { phone: R, phones: [R, R.slice(2), `+${R}`] });
  const cred = await signInWithCustomToken(cauth, token);
  const idToken = await cred.user.getIdToken();
  await db.collection('planner_items').doc('wa1').set({ ownerId: R, type: 'expense', amount: 5 });

  // Without a right code, nothing links
  await auth.startEmailLogin('addme@example.com', '10.2.0.4');
  const real = lastCode();
  assert.equal((await auth.linkEmailToAccount('addme@example.com', real === '000000' ? '111111' : '000000', idToken)).status, 'error');
  const ok = await auth.linkEmailToAccount('addme@example.com', real, idToken);
  assert.deepEqual(ok, { status: 'linked', email: 'addme@example.com' });
  assert.equal((await db.collection('email_identities').get()).docs.some((d) => d.data().email === 'addme@example.com' && d.data().phone === R), true);

  const viaEmail = await emailSignIn('addme@example.com', '10.2.0.5');
  assert.equal(viaEmail.phone, R, 'signing in with the email opens the WhatsApp number’s account (no new account)');

  // Another real number can't take an email that is already linked
  const R2 = '919876500323';
  const t2 = await (jiti(path.join(__dirname, '../../lib/firebase.ts')).adminAuth)().createCustomToken(`wa_${R2}`, { phone: R2, phones: [R2, R2.slice(2)] });
  const c2 = await signInWithCustomToken(cauth, t2);
  await db.collection('auth_codes').get().then((x) => Promise.all(x.docs.map((d) => d.ref.update({ sentAt: 0 }))));
  await auth.startEmailLogin('addme@example.com', '10.2.0.6');
  const refused = await auth.linkEmailToAccount('addme@example.com', lastCode(), await c2.user.getIdToken());
  assert.deepEqual([refused.status, refused.http], ['error', 409]);

  // An email-only account (stand-in) whose email is then added to a real number: merged into it
  const only = await emailSignIn('solo@example.com', '10.2.0.7');
  await db.collection('planner_items').doc('solo1').set({ ownerId: only.phone, type: 'expense', amount: 3 });
  await db.collection('auth_codes').get().then((x) => Promise.all(x.docs.map((d) => d.ref.update({ sentAt: 0 }))));
  await auth.startEmailLogin('solo@example.com', '10.2.0.8');
  const merged = await auth.linkEmailToAccount('solo@example.com', lastCode(), await c2.user.getIdToken());
  assert.equal(merged.status, 'linked');
  assert.equal((await db.collection('planner_items').doc('solo1').get()).data().ownerId, R2, 'its data moved to the number that took the email');
  await signOut(cauth);
});

test('only a stand-in account can be merged away', async () => {
  await assert.rejects(mergeAccounts('919876500001', '919876500002'));
  await assert.rejects(mergeAccounts('910000000009', '910000000008'));
});

after(async () => { await signOut(cauth).catch(() => {}); await deleteApp(app).catch(() => {}); });
