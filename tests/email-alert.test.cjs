const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', out)(mod, mod.exports);
  return mod.exports;
}
const { alertWindow } = load('lib/emailAlert.ts');
const { parseTransactionSms } = load('lib/smsParse.ts');
const parse = body => { const w = alertWindow(body); return w ? parseTransactionSms(w) : null; };

// Bodies modelled on real Indian bank alert emails (subject line first, as the Gmail script sends them).
const emails = {
  hdfcUpi: `❗ You have done a UPI txn. Check details!
Dear Customer,
Rs.250.00 has been debited from account **1234 to VPA zomato@hdfcbank ZOMATO on 01-10-26. Your UPI transaction reference number is 427512345678.
If you did not authorize this transaction, please report it immediately by calling 18002586161 Or SMS BLOCK UPI to 7308080808.
Warm Regards,
HDFC Bank
Never share your Card number, CVV, PIN, OTP, Internet Banking User ID, Password or URN with anyone.`,
  hdfcCard: `Alert : Update on your HDFC Bank Credit Card
Dear Card Member,
Thank you for using your HDFC Bank Credit Card ending 4321 for Rs 1,180.00 at IRCTC on 18-09-2026 14:22:11.
Authorization code:- 012345
After the above transaction, the available balance on your card is Rs 45,000.00 and the total outstanding is Rs 5,000.00.
For more details on this transaction please visit HDFC Bank MyCards. Get pre-approved personal loan offers today!`,
  iciciCard: `Transaction alert for your ICICI Bank Credit Card
Dear Customer,
Your ICICI Bank Credit Card XX9876 has been used for a transaction of INR 3,250.00 on Sep 29, 2026 at 11:02:33. Info: AMAZON PAY IN.
The Available Credit Limit on your card is INR 45,000.00 and Total Credit Limit is INR 1,00,000.00.
In case you have not done this transaction, please call 18001080. Never share your OTP with anyone.`,
  axis: `Debit transaction alert
Dear Customer,
INR 120.00 was debited from your A/c no. XX4321 on 01-10-26 at 09:15:02 IST. Transaction Info: UPI/P2M/427500011122/BLINKIT.
Always open to help you. Regards, Axis Bank Ltd.`,
  kotakCredit: `Credit alert
Dear Customer, Rs.25000.00 is credited to your Kotak Bank a/c XX5678 on 01/10/2026 by UPI Ref No 427566677788 from rahul@okaxis.
This is a system generated email, please do not reply.`,
};

test('HDFC UPI debit email: the OTP disclaimer no longer hides the transaction', () => {
  const t = parse(emails.hdfcUpi);
  assert.equal(t.type, 'expense');
  assert.equal(t.amount, 250);
  assert.equal(t.ref, '427512345678');
  assert.equal(t.date, '2026-10-01');
  assert.match(t.merchant, /zomato/i);
});

test('credit card emails ("thank you for using", "used for a transaction")', () => {
  const h = parse(emails.hdfcCard);
  assert.deepEqual([h.type, h.amount, h.category, h.date], ['expense', 1180, 'Transport', '2026-09-18']);
  assert.match(h.merchant, /irctc/i);
  const i = parse(emails.iciciCard);
  assert.deepEqual([i.type, i.amount, i.category], ['expense', 3250, 'Shopping']);
  assert.match(i.merchant, /amazon/i);
});

test('"A/c no." does not cut the sentence short; credits are income', () => {
  const a = parse(emails.axis);
  assert.deepEqual([a.type, a.amount, a.category], ['expense', 120, 'Groceries']);
  const k = parse(emails.kotakCredit);
  assert.deepEqual([k.type, k.amount, k.ref], ['income', 25000, '427566677788']);
});

test('emails that are not completed transactions are ignored', () => {
  assert.equal(parse('Your OTP for the transaction of Rs 500 at AMAZON is 123456. Do not share it.'), null);
  assert.equal(parse('Your credit card statement is ready. Total amount due Rs 12,000.00. Minimum due Rs 600.00. Payment due date 15-10-2026.'), null);
  assert.equal(parse('Get Rs 500 cashback on your next purchase! Limited period offer.'), null);
  assert.equal(parse('Welcome to net banking. Your profile was updated.'), null);
});
