// Refresh balances from bank emails against the local emulators: `npm run test:emulator`.
// Google's OAuth and Gmail endpoints are replaced with an in-memory mailbox; Firestore is the emulator.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
process.env.GOOGLE_OAUTH_CLIENT_ID = '123456789012-testclient.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
process.env.GMAIL_TOKEN_KEY = Buffer.alloc(32, 9).toString('base64');

const PHONE = '919876500077';
const DAY = 86400000;
const b64 = s => Buffer.from(s, 'utf8').toString('base64url');
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const google = { scope: `openid email ${GMAIL_SCOPE}`, revoked: [], refreshFails: false, apiDisabled: false, throttleAfter: Infinity, gets: 0, queries: [], fetched: [] };
const mailbox = [
  { id: 'b1', from: 'alerts@hdfcbank.net', internalDate: String(Date.now() - 20 * DAY), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Alert' }, { name: 'From', value: 'HDFC Bank <alerts@hdfcbank.net>' }], body: { data: b64('Dear Customer, your account **1234 Available Balance is Rs.10,000.00 as on 01-10-26.') } } },
  { id: 'b2', from: 'alerts@hdfcbank.net', internalDate: String(Date.now() - 2 * DAY), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Alert' }, { name: 'From', value: 'HDFC Bank <alerts@hdfcbank.net>' }], body: { data: b64('Dear Customer, your account **1234 Available Balance is Rs.12,345.67 as on 20-10-26.') } } },
  { id: 'b3', from: 'offers@hdfcbank.net', internalDate: String(Date.now() - 1 * DAY), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Offer' }], body: { data: b64('Get Rs 500 cashback!') } } },
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
    const hits = mailbox.filter(m => fromOk(m) && Number(m.internalDate) / 1000 >= after && Number(m.internalDate) / 1000 < before);
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


test('refresh keeps the newest balance per account from emails', async () => {
  const url = new URL(await gmail.startConnect(PHONE, 'app'));
  await gmail.finishConnect('code1', url.searchParams.get('state'));
  const out = await gmail.refreshBalances(PHONE, Date.now() + 20000);
  assert.equal(out.status, 'ok');
  assert.equal(out.found, 1);
  const acct = (await db.collection('money_accounts').doc(PHONE).collection('accounts').get()).docs.map(d => d.data());
  assert.equal(acct.length, 1);
  assert.equal(acct[0].balance, 12345.67);
  assert.ok(google.queries.some(q => /available balance/.test(q)));
});

test('refresh says not connected when there is no Gmail link', async () => {
  assert.equal((await gmail.refreshBalances('919876500078', Date.now() + 5000)).status, 'not_connected');
});
