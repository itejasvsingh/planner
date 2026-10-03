const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
  return mod.exports;
}
const { messageText, htmlToText, bankQuery } = load('lib/gmailMessage.ts');
const { BANK_DOMAINS } = load('lib/bankSenders.ts');
const appList = load('align-native/src/lib/gmail-script.ts').BANK_DOMAINS;

const b64 = s => Buffer.from(s, 'utf8').toString('base64url');
const headers = subject => [{ name: 'Subject', value: subject }, { name: 'From', value: 'alerts@hdfcbank.net' }];

test('plain-text part is used, with the subject first', () => {
  const msg = { id: 'm1', payload: { mimeType: 'multipart/alternative', headers: headers('UPI txn alert'), parts: [
    { mimeType: 'text/plain', body: { data: b64('Rs.250.00 has been debited from account **1234 to VPA zomato@hdfcbank on 01-10-26.') } },
    { mimeType: 'text/html', body: { data: b64('<p>ignored when plain text exists</p>') } },
  ] } };
  const { subject, text } = messageText(msg);
  assert.equal(subject, 'UPI txn alert');
  assert.match(text, /^UPI txn alert\nRs\.250\.00 has been debited/);
  assert.doesNotMatch(text, /ignored/);
});

test('HTML-only bank emails become readable text; attachments are skipped', () => {
  const html = '<html><head><style>p{color:red}</style></head><body><table><tr><td>Amount</td><td>&#8377;1,180.00</td></tr></table><p>Thank you for using your card at IRCTC&nbsp;on 18-09-2026.</p></body></html>';
  const msg = { id: 'm2', payload: { mimeType: 'multipart/mixed', headers: headers('Card alert'), parts: [
    { mimeType: 'text/html', body: { data: b64(html) } },
    { mimeType: 'application/pdf', filename: 'statement.pdf', body: { attachmentId: 'a1', size: 1000 } },
  ] } };
  const { text } = messageText(msg);
  assert.match(text, /Amount ₹1,180\.00/);
  assert.match(text, /Thank you for using your card at IRCTC on 18-09-2026\./);
  assert.doesNotMatch(text, /color:red|statement\.pdf/);
  assert.equal(htmlToText('a &amp; b &lt;c&gt;'), 'a & b <c>');
});

test('the Gmail search reads only bank senders after the last check', () => {
  const q = bankQuery(['hdfcbank.net', 'slice.bank.in'], { after: 1790000000.7 });
  assert.equal(q, 'from:(hdfcbank.net OR slice.bank.in) {debited credited spent debit credit transaction txn withdrawn paid received} after:1790000000 -in:spam -in:trash');
  assert.match(bankQuery(['x.in'], { after: 1, before: 99.2 }), / after:1 before:100 -in:spam/);
});

test('server and Gmail-script sender lists match (slice included)', () => {
  assert.deepEqual(BANK_DOMAINS, appList);
  assert.ok(BANK_DOMAINS.includes('slice.bank.in'));
});

test('stored Gmail keys are encrypted, and tampering is detected', () => {
  process.env.GMAIL_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
  const { seal, open } = load('lib/secretBox.ts');
  const sealed = seal('1//refresh-token-value');
  assert.doesNotMatch(sealed, /refresh-token-value/);
  assert.equal(open(sealed), '1//refresh-token-value');
  assert.notEqual(seal('same'), seal('same'), 'random IV each time');
  const parts = sealed.split('.');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => open(parts.join('.')));
  process.env.GMAIL_TOKEN_KEY = 'short';
  assert.throws(() => seal('x'), /32 bytes/);
});
