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
const openPdf = fs.readFileSync(path.join(__dirname, '../fixtures/statement-open.pdf'));
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
    // like Gmail, a domain also matches its subdomains (from:bank.in finds …@xyz.bank.in)
    return json({ messages: mailbox.filter((x) => senders.some((s) => x.from.endsWith(`@${s}`) || x.from.endsWith(`.${s}`))).map((x) => ({ id: x.id })) });
  }
  if (/\/attachments\/att[12]$/.test(u)) return json({ data: b64(pdf), size: pdf.length });
  if (/\/attachments\/att3$/.test(u)) return json({ data: b64(openPdf), size: openPdf.length });
  const meta = u.match(/\/messages\/(\w+)\?format=metadata/);
  if (meta) { const m = mailbox.find((x) => x.id === meta[1]); return json({ id: m.id, internalDate: m.internalDate, payload: { headers: m.payload.headers } }); }
  const mm = u.match(/\/messages\/(\w+)\?format=full$/);
  if (mm) return json(mailbox.find((x) => x.id === mm[1]));
  return realFetch(url, opts);
};

const jiti = require('jiti')(__filename);
const gmail = jiti(path.join(__dirname, '../../lib/gmail.ts'));
const { setStatementPassword, statementLine } = jiti(path.join(__dirname, '../../lib/statementAuto.ts'));
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
  assert.equal(st.msgId, 's1');
  assert.ok(st.foundAt > Date.now() - 60000, 'remembers when it was found, for the "new statement" notice');
  assert.equal(statementLine('HDFC Bank', 'hdfc', st), "HDFC Bank account statement read: 4 transactions, 3 new. 1 payment from alerts isn't on it: check Money → Cards.");
  assert.equal(statementLine('HDFC Bank', 'hdfc__card', { state: 'needs_password', at: 1 }), 'HDFC Bank credit card statement found: it needs its PDF password (Align → Settings → Gmail).');
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

test('Find statements lists the last 40 days with what happened to each, from every bank', async () => {
  // A card statement from a bank that isn't ticked in Settings → Gmail (only HDFC is)
  mailbox.push({ id: 's2', from: 'cc.statements@icicibank.com', internalDate: String(Date.now() - 86400000), payload: { mimeType: 'multipart/mixed', headers: [{ name: 'Subject', value: 'ICICI Bank Credit Card Statement' }, { name: 'From', value: 'cc.statements@icicibank.com' }], parts: [{ mimeType: 'application/octet-stream', filename: 'CCStatement', body: { attachmentId: 'att2', size: 1000 } }] } });
  // and one from a bank Align doesn't list, found by its .bank.in address
  mailbox.push({ id: 's3', from: 'estatement@xyz.bank.in', internalDate: String(Date.now() - 2 * 86400000 + 1000), payload: { mimeType: 'multipart/mixed', headers: [{ name: 'Subject', value: 'Statement of Account' }, { name: 'From', value: 'estatement@xyz.bank.in' }], parts: [{ mimeType: 'application/pdf', filename: 'stmt.pdf', body: { attachmentId: 'att3', size: 1000 } }] } });
  const r = await gmail.findStatements(PHONE, 90);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.statements.map((f) => [f.id, f.bankId, f.bankName, f.kind, f.locked]), [
    ['s2', 'icici', 'ICICI Bank', 'card', true],
    ['s3', 'in_xyz', 'XYZ Bank', 'account', false],
    ['s1', 'hdfc', 'HDFC Bank', 'account', true],
  ]);
  // Two lists, one row per bank: needs a password or not, password saved, bank ticked
  const { statementGroups } = jiti(path.join(__dirname, '../../lib/statementAuto.ts'));
  const g = statementGroups((await link().get()).data());
  const pick = (x) => [x.bankId, x.count, x.locked, x.hasPassword, x.selected];
  assert.deepEqual(g.accounts.map(pick), [['hdfc', 1, true, true, true], ['in_xyz', 1, false, false, false]]);
  assert.deepEqual(g.cards.map(pick), [['icici', 1, true, false, false]]);
  const res = await gmail.syncGmail(PHONE, Date.now() + 20000, { statements: 6 });
  assert.equal(res.status, 'ok');
});

test('account or card statement: slice sends both now', () => {
  const { statementKind } = jiti(path.join(__dirname, '../../lib/statementAuto.ts'));
  assert.equal(statementKind('slice', 'Your slice credit card statement for September', ''), 'card');
  assert.equal(statementKind('slice', 'Your slice savings account statement', ''), 'account');
  assert.equal(statementKind('slice', 'Your monthly statement is here', 'Total amount due: Rs 2,340. Minimum amount due: Rs 200'), 'card');
  assert.equal(statementKind('slice', 'Your monthly statement is here', 'Statement of account for your savings account XXXX1234'), 'account');
  assert.equal(statementKind('hdfc', 'Account Statement for September', ''), 'account');
  assert.equal(statementKind('sbicard', 'Your statement', ''), 'card');
});
