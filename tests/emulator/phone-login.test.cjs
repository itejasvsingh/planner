// WhatsApp-code sign-in end to end against the local emulators: `npm run test:emulator`.
// The real server code (lib/phoneAuth.ts) runs with the Admin SDK pointed at the emulators; only the WhatsApp
// API call is replaced, to capture the code. The app side uses the Firebase JS SDK under the real rules.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
process.env.WHATSAPP_API_TOKEN = 'test-token';
process.env.WHATSAPP_PHONE_ID = 'test-phone-id';
delete process.env.WHATSAPP_AUTH_TEMPLATE;

const sent = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('fields=display_phone_number')) {
    return new Response(JSON.stringify({ display_phone_number: '+1 555-010-0199', id: 'test-phone-id' }), { status: 200 });
  }
  if (String(url).startsWith('https://graph.facebook.com/')) {
    sent.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 });
  }
  return realFetch(url, opts);
};
const lastCode = () => sent[sent.length - 1].text.body.match(/\d{6}/)[0];

const jiti = require('jiti')(__filename);
const { startPhoneLogin, verifyPhoneLogin, isLoginRequest, replyWithLoginCode, testLogins } = jiti(path.join(__dirname, '../../lib/phoneAuth.ts'));
const { botNumber } = jiti(path.join(__dirname, '../../lib/whatsappSend.ts'));
const { db, adminAuth } = jiti(path.join(__dirname, '../../lib/firebase.ts'));

const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithCustomToken, signOut } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, collection, query, where, getDocs } = require('firebase/firestore');

const [fsHost, fsPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const app = initializeApp({ projectId: 'demo-align', apiKey: 'demo-key' }, 'client');
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
const cdb = getFirestore(app);
connectFirestoreEmulator(cdb, fsHost, Number(fsPort));

const ME = '919876500001';
const OTHER = '919876500002';

before(async () => {
  await db.collection('planner_items').doc('mine').set({ ownerId: ME.slice(2), type: 'expense', amount: 40 });
  await db.collection('planner_items').doc('theirs').set({ ownerId: OTHER, type: 'expense', amount: 999 });
});

test('a code is sent on WhatsApp, the right code signs in, and the user sees only their own data', async () => {
  const start = await startPhoneLogin(ME.slice(2), '10.0.0.1');
  assert.deepEqual(start, { status: 'sent', template: false });
  assert.equal(sent[sent.length - 1].to, ME);
  const stored = (await db.collection('auth_codes').doc(ME).get()).data();
  assert.ok(stored.hash && !JSON.stringify(stored).includes(lastCode()), 'only a hash of the code is stored');

  const wrong = await verifyPhoneLogin(ME, lastCode() === '000000' ? '111111' : '000000');
  assert.equal(wrong.status, 'error');

  const ok = await verifyPhoneLogin(ME, lastCode());
  assert.equal(ok.status, 'ok');
  assert.equal((await db.collection('auth_codes').doc(ME).get()).exists, false, 'a used code is gone');
  assert.equal((await verifyPhoneLogin(ME, lastCode())).status, 'error', 'codes work once');

  const cred = await signInWithCustomToken(auth, ok.token);
  const claims = (await cred.user.getIdTokenResult()).claims;
  assert.deepEqual([...claims.phones].sort(), [ME, ME.slice(2), `+${ME}`].sort());

  assert.equal((await getDoc(doc(cdb, 'planner_items/mine'))).data().amount, 40);
  const mine = await getDocs(query(collection(cdb, 'planner_items'), where('ownerId', 'in', claims.phones)));
  assert.deepEqual(mine.docs.map(d => d.id), ['mine']);
  await assert.rejects(getDoc(doc(cdb, 'planner_items/theirs')));
  await setDoc(doc(cdb, 'planner_items/new'), { ownerId: ME, type: 'task' });
  await signOut(auth);
});

test('resend waits 30 seconds; five wrong tries lock the code; old codes expire', async () => {
  await startPhoneLogin(OTHER, '10.0.0.2');
  const again = await startPhoneLogin(OTHER, '10.0.0.2');
  assert.match(again.status === 'error' ? again.message : '', /30 seconds/);

  for (let i = 0; i < 5; i++) await verifyPhoneLogin(OTHER, '000000' === lastCode() ? '111111' : '000000');
  const locked = await verifyPhoneLogin(OTHER, lastCode());
  assert.match(locked.status === 'error' ? locked.message : '', /Too many wrong tries/);

  await db.collection('auth_codes').doc(OTHER).set({ sentAt: 0 }, { merge: true });
  await startPhoneLogin(OTHER, '10.0.0.2');
  await db.collection('auth_codes').doc(OTHER).set({ expiresAt: Date.now() - 1 }, { merge: true });
  const expired = await verifyPhoneLogin(OTHER, lastCode());
  assert.match(expired.status === 'error' ? expired.message : '', /expired/);
});

test('a Google-signed-in user links their number with a code and then sees that data', async () => {
  await adminAuth().createUser({ uid: 'google-user', email: 'me@example.com' });
  const cred = await signInWithCustomToken(auth, await adminAuth().createCustomToken('google-user'));
  await assert.rejects(getDoc(doc(cdb, 'planner_items/mine')), 'no access before the number is verified');

  await db.collection('auth_codes').doc(ME).delete();
  await startPhoneLogin(ME, '10.0.0.3');
  const linked = await verifyPhoneLogin(ME, lastCode(), await cred.user.getIdToken());
  assert.deepEqual(linked, { status: 'linked', phone: ME });
  assert.equal((await db.collection('users').doc('google-user').get()).data().phone, ME);

  await cred.user.getIdToken(true);
  assert.equal((await getDoc(doc(cdb, 'planner_items/mine'))).data().amount, 40);
  await signOut(auth);
});

test('bad input and bad tokens are refused', async () => {
  assert.equal((await startPhoneLogin('12345', '10.0.0.4')).status, 'error');
  assert.equal((await verifyPhoneLogin(ME, '12')).status, 'error');
  await db.collection('auth_codes').doc(ME).delete();
  await startPhoneLogin(ME, '10.0.0.4');
  const forged = await verifyPhoneLogin(ME, lastCode(), 'not-a-real-id-token');
  assert.equal(forged.status, 'error');
});

test('"Login" sent to the bot gets a code back that signs in, without the 30-second wait', async () => {
  for (const t of ['Login', 'login', ' log in ', 'LOGIN!', 'code', 'OTP', 'sign in']) assert.ok(isLoginRequest(t), t);
  for (const t of ['login to netflix 499', 'spent 250 on lunch', 'what is my code', '']) assert.ok(!isLoginRequest(t), t);

  const who = '919876500003';
  await startPhoneLogin(who, '10.0.0.5'); // app asked first; the bot reply must not be blocked by the resend wait
  const before = sent.length;
  await replyWithLoginCode(who);
  assert.equal(sent.length, before + 1);
  assert.equal(sent[sent.length - 1].to, who);
  const ok = await verifyPhoneLogin(who.slice(2), lastCode());
  assert.equal(ok.status, 'ok');
});

test("the login screen can find Align's WhatsApp number", async () => {
  assert.equal(await botNumber(), '15550100199');
});

test('tester sign-in: a fake number and an agreed code, no WhatsApp message; real numbers and bad entries are ignored', async () => {
  // Parsing: only 91 + ten digits starting with 0 (never a real mobile number) and a 6-digit code count
  assert.deepEqual([...testLogins('910000000001:482913, 0000000002:731946 ,919876543210:111111,910000000003:12345,garbage,910000000004:abcdef')].sort(), [['910000000001', '482913'], ['910000000002', '731946']]);
  assert.equal(testLogins('').size + testLogins(undefined).size, 0, 'off by default');

  process.env.TEST_LOGINS = '910000000001:482913,919876500099:555555';
  try {
    const before = sent.length;
    assert.deepEqual(await startPhoneLogin('0000000001', '10.0.0.7'), { status: 'sent', template: false });
    assert.equal(sent.length, before, 'no WhatsApp message for a tester');

    const wrong = await verifyPhoneLogin('910000000001', '000000');
    assert.equal(wrong.status, 'error');
    const ok = await verifyPhoneLogin('910000000001', '482913');
    assert.equal(ok.status, 'ok');
    const cred = await signInWithCustomToken(auth, ok.token);
    assert.ok(cred.user.uid.startsWith('wa_9100000000'), 'a normal sign-in token for the fake number');
    await db.collection('planner_items').doc('tester-own').set({ ownerId: '910000000001', type: 'expense', amount: 5 });
    const own = await getDocs(query(collection(cdb, 'planner_items'), where('ownerId', 'in', ['910000000001', '0000000001'])));
    assert.deepEqual(own.docs.map((d) => d.id), ['tester-own'], 'the tester sees their own data');
    await assert.rejects(getDoc(doc(cdb, 'planner_items', 'theirs')), 'and nobody else\'s');
    await signOut(auth);

    // A real-looking number in the list is ignored: it goes through WhatsApp like anyone else
    const real = await startPhoneLogin('919876500099', '10.0.0.8');
    assert.equal(real.status, 'sent');
    assert.equal(sent.length, before + 1, 'a WhatsApp code was sent for the real-looking number');
    assert.equal((await verifyPhoneLogin('919876500099', '555555')).status, 'error', 'its listed code does not work');

    // Wrong tries are limited
    let last;
    for (let i = 0; i < 14; i++) last = await verifyPhoneLogin('910000000001', '999999');
    assert.equal(last.http, 429);
  } finally {
    delete process.env.TEST_LOGINS;
  }
  const after = await startPhoneLogin('910000000001', '10.0.0.9');
  assert.equal(after.status, 'sent');
  assert.equal(sent[sent.length - 1].to, '910000000001', 'switched off again: goes through WhatsApp');
});
