// Statement PDFs read automatically from Gmail: `npm run test:emulator`. Google is simulated; the PDF is a
// made-up statement (tests/fixtures/statement-locked.pdf, password TEST1234).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
process.env.GOOGLE_OAUTH_CLIENT_ID = '123456789012-testclient.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
process.env.GMAIL_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');

const b64 = (b) => Buffer.from(b).toString('base64url');
const pdf = fs.readFileSync(path.join(__dirname, '../fixtures/statement-locked.pdf'));
const mailbox = [{
  id: 's1', from: 'estatement@hdfcbank.net', internalDate: String(Date.now() - 2 * 86400000),
  payload: { mimeType: 'multipart/mixed', headers: [{ name: 'Subject', value: 'Your HDFC Bank account statement' }, { name: 'From', value: 'HDFC Bank <estatement@hdfcbank.net>' }], parts: [
    { mimeType: 'text/plain', body: { data: b64('Dear Customer, please find attached the statement for your account XXXXXX7788. The file is password protected.') } },
    { mimeType: 'application/pdf', filename: 'Statement_Sep2026.pdf', body: { attachmentId: 'att1', size: pdf.length } },
  ] },
}];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(opts.body);
    if (form.get('grant_type') === 'authorization_code') return json({ access_token: 'a', refresh_token: 'r', scope: 'openid email https://www.googleapis.com/auth/gmail.readonly', id_token: ['x', b64('{"email":"me@gmail.com"}'), 'y'].join('.') });
    return json({ access_token: 'a2' });
  }
  if (u.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
    const q = new URL(u).searchParams.get('q');
    const senders = ((q.match(/from:\(([^)]*)\)/) || [])[1] || '').split(' OR ');
    return json({ messages: mailbox.filter((x) => senders.some((s) => x.from.endsWith(`@${s}`))).map((x) => ({ id: x.id })) });
  }
  if (/\/messages\/s1\/attachments\/att1$/.test(u)) return json({ data: b64(pdf), size: pdf.length });
  const mm = u.match(/\/messages\/(\w+)\?format=full$/);
  if (mm) return json(mailbox.find((x) => x.id === mm[1]));
  return realFetch(url, opts);
};

const jiti = require('jiti')(__filename);
const gmail = jiti(path.join(__dirname, '../../lib/gmail.ts'));
const { setStatementPassword } = jiti(path.join(__dirname, '../../lib/statementAuto.ts'));
const { recordTransaction } = jiti(path.join(__dirname, '../../lib/recordTransaction.ts'));
const { accountBalances } = jiti(path.join(__dirname, '../../lib/moneyAccounts.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));

const PHONE = '919800000401';
const link = () => db.collection('gmail_links').doc(PHONE);
const sync = async () => { await link().update({ syncingSince: null }); return gmail.syncGmail(PHONE, Date.now() + 25000); };
const items = async () => (await db.collection('planner_items').where('ownerId', '==', PHONE).get()).docs.map((d) => d.data());

test('a locked statement waits for its password', async () => {
  await gmail.finishConnect('c1', new URL(await gmail.startConnect(PHONE, 'web')).searchParams.get('state'));
  await gmail.saveBankChoices(PHONE, ['hdfc'], []);
  await sync();
  assert.equal((await link().get()).data().statementStatus.hdfc.state, 'needs_password');
  assert.equal((await items()).length, 0);
  await sync();
  assert.equal((await link().get()).data().statementStatus.hdfc.state, 'needs_password', 'not re-downloaded until a password is saved');
});

test('a wrong password says so; the right one imports the transactions and the closing balance', async () => {
  await setStatementPassword(PHONE, 'hdfc', 'wrong');
  await sync();
  assert.equal((await link().get()).data().statementStatus.hdfc.state, 'wrong_password');

  // The rent payment already came in by SMS (same UPI reference): not added twice
  await recordTransaction(PHONE, { type: 'expense', amount: 15000, merchant: 'Rent', category: 'Home & Help', ref: '624533334444', date: '2026-09-15', time: null }, { source: 'sms', dedupText: 'rent sms', date: '2026-09-15' });
  // An alert for this account that the statement doesn't have (a duplicate or a mistake): listed by the check
  await recordTransaction(PHONE, { type: 'expense', amount: 999, merchant: 'Mystery Shop', category: 'Shopping', ref: null, date: '2026-09-12', time: null }, { source: 'gmail', dedupText: 'gmail:mystery', date: '2026-09-12', account: '7788' });
  await setStatementPassword(PHONE, 'hdfc', 'TEST1234');
  await sync();
  const st = (await link().get()).data().statementStatus.hdfc;
  assert.deepEqual([st.state, st.locked, st.rows, st.added, st.from, st.to], ['ok', true, 4, 3, '2026-09-03', '2026-09-28']);
  assert.deepEqual([st.checked, st.extras], [true, [{ title: 'Mystery Shop', amount: 999, date: '2026-09-12' }]]);
  const all = (await items()).filter((i) => i.title !== 'Mystery Shop');
  assert.equal(all.length, 4, 'opening balance is not a transaction; rent once');
  assert.deepEqual(all.filter((i) => i.source === 'statement').map((i) => i.amount).sort((a, b) => a - b), [450, 2000, 50000]);
  const [acc] = await accountBalances(PHONE);
  assert.deepEqual([acc.bankId, acc.last4, acc.balance], ['hdfc', '7788', 42550]);
  // The password is stored sealed, never as typed
  assert.equal(JSON.stringify((await link().get()).data()).includes('TEST1234'), false);
});

test('a statement already read is not read again', async () => {
  await sync();
  assert.equal((await items()).length, 5);
});
