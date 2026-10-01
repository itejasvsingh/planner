const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/smsParse.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { parseTransactionSms } = mod.exports;

const cases = [
  ['HDFC UPI', 'Sent Rs.250.00 From HDFC Bank A/C *1234 To ZOMATO On 01/10/26 Ref 427512345678 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808',
    { type: 'expense', amount: 250, merchantRe: /zomato/i, category: 'Food & Dining', ref: '427512345678', date: '2026-10-01' }],
  ['SBI UPI', 'Dear UPI user A/C X1234 debited by 1,499.00 on date 30Sep26 trf to UBER INDIA Refno 427398765432. If not u? call 1800111109. -SBI',
    { type: 'expense', amount: 1499, merchantRe: /uber/i, category: 'Transport', ref: '427398765432' }],
  ['ICICI card', 'INR 3,250.00 spent on ICICI Bank Card XX9876 on 29-Sep-26 at AMAZON PAY IN. Avl Lmt: INR 45,000.00. To dispute, call 18001080.',
    { type: 'expense', amount: 3250, merchantRe: /amazon/i, category: 'Shopping', date: '2026-09-29' }],
  ['Axis debit', 'INR 120.00 debited A/c no. XX4321 01-10-26, 09:15:02 UPI/P2M/427500011122/BLINKIT Not you? SMS BLOCKUPI',
    { type: 'expense', amount: 120, category: 'Groceries' }],
  ['Kotak credit', 'Rs.25000.00 credited to your A/c X5678 on 01-10-26 from VPA rahul@okaxis (UPI Ref No 427566677788).',
    { type: 'income', amount: 25000, category: 'Money Received', ref: '427566677788' }],
  ['Salary', 'Your A/c XX1111 is credited with INR 85,000.00 on 30-09-2026 by NEFT SALARY ACME CORP. Avl bal INR 1,02,345.00',
    { type: 'income', amount: 85000, category: 'Salary', date: '2026-09-30' }],
];

for (const [name, sms, want] of cases) {
  test(`parses ${name}`, () => {
    const got = parseTransactionSms(sms);
    assert.ok(got, 'should parse');
    assert.equal(got.type, want.type);
    assert.equal(got.amount, want.amount);
    if (want.merchantRe) assert.match(got.merchant, want.merchantRe);
    if (want.category) assert.equal(got.category, want.category);
    if (want.ref) assert.equal(got.ref, want.ref);
    if (want.date) assert.equal(got.date, want.date);
  });
}

const ignored = [
  ['OTP', '123456 is your OTP for txn of Rs 2,000.00 at AMAZON. Do not share. -HDFC Bank'],
  ['future debit', 'Rs 499 will be debited from your account on 05-10-26 for Netflix autopay mandate.'],
  ['bill due', 'Your Airtel bill of Rs 799 is due on 10 Oct. Pay now.'],
  ['collect request', 'Rahul has requested money of Rs 300 from you on PhonePe.'],
  ['failed', 'Your transaction of Rs 1,200 at SWIGGY has failed. Amount will be refunded.'],
  ['promo', 'Get Rs 500 cashback offer on your next order!'],
];
for (const [name, sms] of ignored) {
  test(`ignores ${name}`, () => assert.equal(parseTransactionSms(sms), null));
}
