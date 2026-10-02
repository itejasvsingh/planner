// Connect Gmail and alert sync against the local emulators: `npm run test:emulator`.
// Google's OAuth and Gmail endpoints are replaced with an in-memory mailbox; Firestore is the emulator.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
process.env.GOOGLE_OAUTH_CLIENT_ID = '123456789012-testclient.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
process.env.GMAIL_TOKEN_KEY = Buffer.alloc(32, 9).toString('base64');

const PHONE = '919876500010';
const DAY = 86400000;
const b64 = s => Buffer.from(s, 'utf8').toString('base64url');
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const google = { scope: `openid email ${GMAIL_SCOPE}`, revoked: [], refreshFails: false, apiDisabled: false, queries: [], fetched: [] };
const mailbox = [
  { id: 'g1', internalDate: String(Date.now() - 3 * DAY), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'UPI txn' }], body: { data: b64('Dear Customer, Rs.250.00 has been debited from account **1234 to VPA zomato@hdfcbank ZOMATO on 01-10-26. Your UPI transaction reference number is 427512345678. Never share your OTP.') } } },
  { id: 'g2', internalDate: String(Date.now() - 2 * DAY), payload: { mimeType: 'text/html', headers: [{ name: 'Subject', value: 'Card alert' }], body: { data: b64('<p>Dear Customer,</p><p>Your ICICI Bank Credit Card XX9876 has been used for a transaction of INR 3,250.00 on Sep 29, 2026 at 11:02:33. Info: AMAZON PAY IN.</p>') } } },
  { id: 'g3', internalDate: String(Date.now() - 1 * DAY), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Offer' }], body: { data: b64('Get Rs 500 cashback on your next purchase! Limited period offer.') } } },
];

const realFetch = global.fetch;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(opts.body);
    if (form.get('grant_type') === 'authorization_code') {
      const idToken = ['x', b64(JSON.stringify({ email: 'me@gmail.com' })), 'y'].join('.');
      return json({ access_token: 'at-1', refresh_token: `rt-${form.get('code')}`, scope: google.scope, id_token: idToken });
    }
    return google.refreshFails ? json({ error: 'invalid_grant' }, 400) : json({ access_token: 'at-2' });
  }
  if (u.startsWith('https://oauth2.googleapis.com/revoke')) {
    google.revoked.push(new URL(u).searchParams.get('token'));
    return json({});
  }
  if (google.apiDisabled && u.startsWith('https://gmail.googleapis.com/')) {
    return json({ error: { code: 403, message: 'Gmail API has not been used in project 817744322906 before or it is disabled.', status: 'PERMISSION_DENIED' } }, 403);
  }
  if (u.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
    google.queries.push(new URL(u).searchParams.get('q'));
    return json({ messages: [...mailbox].reverse().map(m => ({ id: m.id })) }); // newest first, like Gmail
  }
  const m = u.match(/\/messages\/(\w+)\?format=full$/);
  if (m) {
    google.fetched.push(m[1]);
    return json(mailbox.find(x => x.id === m[1]));
  }
  return realFetch(url, opts);
};

const jiti = require('jiti')(__filename);
const gmail = jiti(path.join(__dirname, '../../lib/gmail.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));
const { requestUser } = jiti(path.join(__dirname, '../../lib/requestUser.ts'));

async function connect(code) {
  const url = new URL(await gmail.startConnect(PHONE, 'app'));
  return gmail.finishConnect(code, url.searchParams.get('state'));
}

test('connect asks for read-only Gmail and stores only an encrypted key', async () => {
  const url = new URL(await gmail.startConnect(PHONE, 'web'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), `openid email ${GMAIL_SCOPE}`);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://alignplanner.vercel.app/api/gmail/callback');

  const state = url.searchParams.get('state');
  const done = await gmail.finishConnect('code1', state);
  assert.deepEqual(done, { returnTo: 'web', result: 'connected', phone: PHONE });
  const link = (await db.collection('gmail_links').doc(PHONE).get()).data();
  assert.equal(link.email, 'me@gmail.com');
  assert.doesNotMatch(JSON.stringify(link), /rt-code1/, 'refresh token is not stored in plain text');
  assert.equal((await gmail.finishConnect('code1', state)).result, 'expired', 'a state works once');
  assert.deepEqual(await gmail.linkStatus(PHONE), { connected: true, email: 'me@gmail.com', status: 'connected', lastSyncAt: null, added: 0, lastError: null });
});

test('if Gmail access was unticked on the consent screen, nothing is kept and the grant is revoked', async () => {
  google.scope = 'openid email';
  const done = await connect('nogmail');
  assert.equal(done.result, 'missing_scope');
  assert.ok(google.revoked.includes('rt-nogmail'));
  google.scope = `openid email ${GMAIL_SCOPE}`;
  assert.equal((await db.collection('gmail_links').doc(PHONE).get()).data().token.startsWith('v1.'), true, 'earlier link untouched');
});

test('sync adds bank alerts once, skips what SMS already recorded, and ignores promotions', async () => {
  // The UPI payment already came in by SMS (same bank ref → same document id).
  const { createHash } = require('node:crypto');
  const smsId = `auto_${createHash('sha256').update(`${PHONE}_ref_427512345678`).digest('hex').slice(0, 28)}`;
  await db.collection('planner_items').doc(smsId).set({ ownerId: PHONE, type: 'expense', title: 'Zomato', amount: 250, source: 'sms' });

  const first = await gmail.syncGmail(PHONE, Date.now() + 20000);
  assert.deepEqual(first, { status: 'ok', added: 1, checked: 3 });
  assert.match(google.queries[0], /^from:\(.*slice\.bank\.in.*\) after:\d+ -in:spam -in:trash$/);
  assert.ok(Number(google.queries[0].match(/after:(\d+)/)[1]) <= (Date.now() - 89 * DAY) / 1000, 'first sync looks back ~90 days');
  assert.deepEqual(google.fetched, ['g1', 'g2', 'g3'], 'oldest first');

  const items = (await db.collection('planner_items').where('ownerId', '==', PHONE).get()).docs.map(d => d.data());
  const card = items.find(i => i.amount === 3250);
  assert.equal(card.source, 'gmail');
  assert.equal(card.type, 'expense');
  assert.equal(card.category, 'Shopping');
  assert.equal(items.filter(i => i.amount === 250).length, 1, 'UPI payment not doubled');
  assert.equal(items.length, 2);

  const second = await gmail.syncGmail(PHONE, Date.now() + 20000);
  assert.equal(second.added, 0);
  assert.ok(Number(google.queries[1].match(/after:(\d+)/)[1]) > (Date.now() - 3 * DAY) / 1000, 'later syncs start near the last one');
  const status = await gmail.linkStatus(PHONE);
  assert.equal(status.added, 1);
  assert.ok(status.lastSyncAt > Date.now() - 60000);
});

test('revoked access asks the user to reconnect; disconnect revokes and forgets the key', async () => {
  google.refreshFails = true;
  assert.equal((await gmail.syncGmail(PHONE, Date.now() + 5000)).status, 'reconnect');
  assert.equal((await gmail.linkStatus(PHONE)).status, 'reconnect');
  google.refreshFails = false;
  const all = await gmail.syncAll(Date.now() + 20000);
  assert.equal(all.users, 0, 'only connected accounts are synced');

  await connect('code2');
  assert.ok(google.revoked.includes('rt-code1'), 'the replaced key is revoked');
  await gmail.disconnect(PHONE);
  assert.ok(google.revoked.includes('rt-code2'));
  assert.equal((await db.collection('gmail_links').doc(PHONE).get()).exists, false);
  assert.deepEqual(await gmail.linkStatus(PHONE), { connected: false });
});

test('API calls need a signed-in user with a verified number', async () => {
  const { adminAuth } = jiti(path.join(__dirname, '../../lib/firebase.ts'));
  const { initializeApp } = require('firebase/app');
  const { getAuth, connectAuthEmulator, signInWithCustomToken } = require('firebase/auth');
  const app = initializeApp({ projectId: 'demo-align', apiKey: 'demo-key' }, 'gmail-test');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const req = token => new Request('http://x/api/gmail/status', { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  assert.equal(await requestUser(req()), null);
  const noPhone = await signInWithCustomToken(auth, await adminAuth().createCustomToken('g-only'));
  assert.equal(await requestUser(req(await noPhone.user.getIdToken())), null);
  const withPhone = await signInWithCustomToken(auth, await adminAuth().createCustomToken(`wa_${PHONE}`, { phone: PHONE, phones: [PHONE] }));
  assert.deepEqual(await requestUser(req(await withPhone.user.getIdToken())), { uid: `wa_${PHONE}`, phone: PHONE });
});

test('client ID pasted with spaces or quotes still works; a wrong-looking one gives a clear message', async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = '  "123456789012-abc123def.apps.googleusercontent.com"\n';
  const url = new URL(await gmail.startConnect(PHONE, 'web'));
  assert.equal(url.searchParams.get('client_id'), '123456789012-abc123def.apps.googleusercontent.com');
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'GOCSPX-this-is-a-secret';
  await assert.rejects(gmail.startConnect(PHONE, 'web'), /doesn’t look like a Google client ID/);
  process.env.GOOGLE_OAUTH_CLIENT_ID = '123456789012-testclient.apps.googleusercontent.com';
});

test('a failed check says what to fix (Gmail API switched off)', async () => {
  await connect('code3');
  google.apiDisabled = true;
  const r = await gmail.syncGmail(PHONE, Date.now() + 5000);
  google.apiDisabled = false;
  assert.equal(r.status, 'error');
  assert.match(r.message, /Gmail API is switched off.*Enable/);
  assert.match((await gmail.linkStatus(PHONE)).lastError, /Gmail API is switched off/);
});
