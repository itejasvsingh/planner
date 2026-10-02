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
  if (String(url).startsWith('https://graph.facebook.com/')) {
    sent.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 });
  }
  return realFetch(url, opts);
};
const lastCode = () => sent[sent.length - 1].text.body.match(/\d{6}/)[0];

const jiti = require('jiti')(__filename);
const { startPhoneLogin, verifyPhoneLogin } = jiti(path.join(__dirname, '../../lib/phoneAuth.ts'));
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
