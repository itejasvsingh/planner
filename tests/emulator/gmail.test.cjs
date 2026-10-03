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

const google = { scope: `openid email ${GMAIL_SCOPE}`, revoked: [], refreshFails: false, apiDisabled: false, throttleAfter: Infinity, gets: 0, queries: [], fetched: [] };
const mailbox = [
  { id: 'g1', from: 'alerts@hdfcbank.net', internalDate: String(Date.now() - 3 * DAY), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'UPI txn' }], body: { data: b64('Dear Customer, Rs.250.00 has been debited from account **1234 to VPA zomato@hdfcbank ZOMATO on 01-10-26. Your UPI transaction reference number is 427512345678. Never share your OTP.') } } },
  { id: 'g2', from: 'credit_cards@icicibank.com', internalDate: String(Date.now() - 2 * DAY), payload: { mimeType: 'text/html', headers: [{ name: 'Subject', value: 'Card alert' }], body: { data: b64('<p>Dear Customer,</p><p>Your ICICI Bank Credit Card XX9876 has been used for a transaction of INR 3,250.00 on Sep 29, 2026 at 11:02:33. Info: AMAZON PAY IN.</p>') } } },
  { id: 'g3', from: 'offers@hdfcbank.net', internalDate: String(Date.now() - 1 * DAY), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Offer' }], body: { data: b64('Get Rs 500 cashback on your next purchase! Limited period offer.') } } },
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
    const q = new URL(u).searchParams.get('q');
    google.queries.push(q);
    const after = Number((q.match(/after:(\d+)/) || [])[1] || 0);
    const before = Number((q.match(/before:(\d+)/) || [])[1] || Infinity);
    const senders = ((q.match(/from:\(([^)]*)\)/) || [])[1] || '').split(' OR ');
    const fromOk = m => senders.some(sd => m.from === sd || m.from.endsWith(`@${sd}`) || m.from.endsWith(`.${sd}`));
    const hits = mailbox.filter(m => fromOk(m) && Number(m.internalDate) / 1000 > after && Number(m.internalDate) / 1000 < before);
    return json({ messages: hits.reverse().map(m => ({ id: m.id })) }); // newest first, like Gmail
  }
  const m = u.match(/\/messages\/(\w+)\?format=full$/);
  if (m && ++google.gets > google.throttleAfter) {
    return json({ error: { code: 403, message: "Quota exceeded for quota metric 'Total query cost' and limit 'Total query cost per minute per user'", status: 'PERMISSION_DENIED' } }, 403);
  }
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
  assert.deepEqual(first, { status: 'ok', added: 1, checked: 3, bills: 0 });
  assert.match(google.queries[0], /^from:\(.*slice\.bank\.in.*\) \{debited .*\} after:\d+ -in:spam -in:trash$/);
  assert.match(google.queries[1], / before:\d+ /, 'then the history');
  assert.ok(Number(google.queries[1].match(/after:(\d+)/)[1]) <= (Date.now() - 89 * DAY) / 1000, 'history goes back ~90 days');
  assert.deepEqual([...google.fetched].sort(), ['g1', 'g2', 'g3'], 'each email read once');
  assert.equal(google.fetched[2], 'g1', 'recent emails first, the oldest last');

  const items = (await db.collection('planner_items').where('ownerId', '==', PHONE).get()).docs.map(d => d.data());
  const card = items.find(i => i.amount === 3250);
  assert.equal(card.source, 'gmail');
  assert.equal(card.time, '11:02', 'time from the alert text');
  assert.equal(card.type, 'expense');
  assert.equal(card.category, 'Shopping');
  assert.equal(items.filter(i => i.amount === 250).length, 1, 'UPI payment not doubled');
  assert.equal(items.length, 2);

  const before = google.queries.length;
  const second = await gmail.syncGmail(PHONE, Date.now() + 20000);
  assert.equal(second.added, 0);
  assert.equal(second.message, undefined, 'history finished in the first check');
  const later = google.queries.slice(before);
  assert.ok(later.every(q => !/ before:/.test(q)), 'later checks look for new emails (and bills), not the history again');
  assert.ok(later.some(q => /\{statement bill/.test(q)), 'and look for card bills');
  assert.ok(Number(google.queries[before].match(/after:(\d+)/)[1]) > (Date.now() - 3 * DAY) / 1000, 'later checks start near the last one');
  const status = await gmail.linkStatus(PHONE);
  assert.equal(status.added, 1);
  assert.ok(status.lastSyncAt > Date.now() - 60000);
});

test('revoked access asks the user to reconnect; disconnect revokes and forgets the key', async () => {
  google.refreshFails = true;
  assert.equal((await gmail.syncGmail(PHONE, Date.now() + 5000)).status, 'reconnect');
  assert.equal((await gmail.linkStatus(PHONE)).status, 'reconnect');
  google.refreshFails = false;
  const before = (await gmail.linkStatus(PHONE)).lastSyncAt;
  await gmail.syncAll(Date.now() + 20000);
  assert.equal((await gmail.linkStatus(PHONE)).lastSyncAt, before, 'an account that needs reconnecting is skipped');

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

test('when Gmail says slow down, what was read is kept and the next check continues', async () => {
  const P2 = '919876500011';
  await gmail.finishConnect('code4', new URL(await gmail.startConnect(P2, 'web')).searchParams.get('state'));
  google.gets = 0;
  google.throttleAfter = 1; // the second read is refused
  const first = await gmail.syncGmail(P2, Date.now() + 10000);
  assert.equal(first.status, 'ok');
  assert.match(first.message, /slow down/);
  assert.equal(first.checked, 1);
  const afterFirst = (await db.collection('planner_items').where('ownerId', '==', P2).get()).size;

  google.throttleAfter = Infinity;
  const second = await gmail.syncGmail(P2, Date.now() + 10000);
  assert.equal(second.status, 'ok');
  assert.equal(second.message, undefined);
  const total = (await db.collection('planner_items').where('ownerId', '==', P2).get()).size;
  assert.equal(total, 2, 'UPI alert + card alert, each once');
  const upi = (await db.collection('planner_items').where('ownerId', '==', P2).where('amount', '==', 250).get()).docs[0].data();
  const arrived = new Date(Number(mailbox[0].internalDate) + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
  assert.equal(upi.time, arrived, 'no time in the alert: when the email arrived (India time)');
  assert.equal(upi.ref, '427512345678', 'reference stored for matching');
  assert.ok(total > afterFirst);
  assert.equal((await gmail.linkStatus(P2)).lastError, null);
});

test('two checks for the same person never run at once (they share Gmail\'s per-minute quota)', async () => {
  const P3 = '919876500012';
  await gmail.finishConnect('code5', new URL(await gmail.startConnect(P3, 'web')).searchParams.get('state'));
  google.gets = 0;
  const [a, b] = await Promise.all([gmail.syncGmail(P3, Date.now() + 10000), gmail.syncGmail(P3, Date.now() + 10000)]);
  const busy = [a, b].filter(r => /Already checking/.test(r.message || ''));
  assert.equal(busy.length, 1, 'one of them backs off');
  assert.equal(google.gets, 3, 'each email read once');
  const after = await gmail.syncGmail(P3, Date.now() + 10000);
  assert.doesNotMatch(after.message || '', /Already checking/, 'the lock is released when a check ends');
});

test('bank picker: finds the banks in Gmail, reads only the chosen ones, and catches up when one is added', async () => {
  const P4 = '919876500013';
  await gmail.finishConnect('code6', new URL(await gmail.startConnect(P4, 'web')).searchParams.get('state'));

  const detected = await gmail.detectBanks(P4, Date.now() + 20000);
  assert.deepEqual(detected.sort(), ['hdfc', 'icici'], 'one search per bank, nothing read');
  const choices = await gmail.bankChoices(P4);
  assert.equal(choices.selected, null, 'nothing chosen yet: every bank is searched');
  assert.ok(choices.banks.some(b => b.id === 'slice'));

  const saved = await gmail.saveBankChoices(P4, ['hdfc', 'not-a-bank'], ['alerts@mynewbank.in', 'not an email']);
  assert.deepEqual([saved.banks, saved.extra], [['hdfc'], ['alerts@mynewbank.in']]);
  google.fetched = [];
  await gmail.syncGmail(P4, Date.now() + 20000);
  assert.ok(!google.fetched.includes('g2'), 'the ICICI email is not read: ICICI was not chosen');
  const q = google.queries[google.queries.length - 1];
  assert.match(q, /hdfcbank\.net/);
  assert.match(q, /mynewbank\.in/);
  assert.doesNotMatch(q, /icicibank/);
  let items = (await db.collection('planner_items').where('ownerId', '==', P4).get()).docs.map(d => d.data());
  assert.deepEqual(items.map(i => i.amount), [250]);

  const more = await gmail.saveBankChoices(P4, ['hdfc', 'icici'], ['alerts@mynewbank.in']);
  assert.equal(more.rereading, true, 'adding a bank re-reads the history');
  await gmail.syncGmail(P4, Date.now() + 20000);
  items = (await db.collection('planner_items').where('ownerId', '==', P4).get()).docs.map(d => d.data());
  assert.deepEqual(items.map(i => i.amount).sort((a, b) => a - b), [250, 3250], 'the ICICI card spend now, nothing doubled');
});
