const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, deps = {}) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, name => deps[name]);
  return mod.exports;
}
const sms = load('lib/smsParse.ts');
const { alertWindow, parseBankEmail, parseCardBill, isCardPaymentReceived } = load('lib/emailAlert.ts', { './smsParse': sms });
const { parseTransactionSms } = sms;
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

// slice (noreply@slice.bank.in): the details sit in a table, flattened to "To NAME" / "RRN number" lines.
test('slice bank emails: amount, merchant from the "To" row, RRN and date', () => {
  const debit = `₹20 debited from your slice bank account
Hi Tejasv,
₹20 debited from your slice bank account xx8002 via UPI.
Transaction date 02-Oct-26
To ISTHARA PARKS PRIVATE LIMITED
RRN 627574346774
Best,
Team slice
If you did not make this transaction, call us. Never share your OTP or PIN with anyone.`;
  const d = parse(debit);
  assert.deepEqual([d.type, d.amount, d.merchant, d.ref, d.date], ['expense', 20, 'Isthara Parks', '627574346774', '2026-10-02']);

  const credit = `₹1,500 credited to your slice bank account
Hi Tejasv,
₹1,500 credited to your slice bank account xx8002 via UPI.
Transaction date 03-Oct-26
From RAHUL KUMAR SHARMA
RRN 627512340000
Best,
Team slice`;
  const c = parse(credit);
  assert.deepEqual([c.type, c.amount, c.merchant, c.ref, c.date], ['income', 1500, 'Rahul Kumar Sharma', '627512340000', '2026-10-03']);
});

// Any bank: the general reader (sentence first, labelled rows to fill gaps or stand in).
const brief = t => t && [t.type, t.amount, t.merchant, t.ref, t.date];

test('table-only alert with a "debit transaction" and labelled rows', () => {
  const kotakLike = `Transaction alert
Dear Customer,
A debit transaction has been made from your account XX5678.
Amount INR 1,250.00
Date 30 Sep 2026
Merchant Name BIGBASKET
Reference No 427511112222`;
  assert.deepEqual(brief(parseBankEmail(kotakLike)), ['expense', 1250, 'Bigbasket', '427511112222', '2026-09-30']);
});

test('UPI credit with "Received from" row and month-first date', () => {
  const upi = `You received money
₹2,000 credited to your account.
Received from PRIYA NAIR
UPI Ref No 627598765432
Date & Time Oct 3, 2026 09:15 AM`;
  assert.deepEqual(brief(parseBankEmail(upi)), ['income', 2000, 'Priya Nair', '627598765432', '2026-10-03']);
});

test('sentence emails still work and gain the reference from a row', () => {
  const hdfcCard = `Alert : Update on your HDFC Bank Credit Card
Dear Card Member,
Thank you for using your HDFC Bank Credit Card ending 4321 for Rs 1,180.00 at IRCTC on 18-09-2026 14:22:11.
Transaction ID 82736455112`;
  const t = parseBankEmail(hdfcCard);
  assert.deepEqual([t.type, t.amount, t.ref, t.date], ['expense', 1180, '82736455112', '2026-09-18']);
  assert.match(t.merchant, /irctc/i);
  const icici = parseBankEmail(`Card alert
Your ICICI Bank Credit Card XX9876 has been used for a transaction of INR 3,250.00 on Sep 29, 2026 at 11:02:33. Info: AMAZON PAY IN.`);
  assert.deepEqual([icici.type, icici.amount, icici.date], ['expense', 3250, '2026-09-29']);
});

test('statements, OTPs, reminders and offers are not transactions, whatever the bank', () => {
  assert.equal(parseBankEmail(`Your credit card statement for September
Total Amount Due INR 12,000.00
Minimum Amount Due INR 600.00
Payment Due Date 15 Oct 2026`), null);
  assert.equal(parseBankEmail('OTP for your transaction\n482913 is your OTP for a transaction of Rs 999 at FLIPKART. Do not share it.'), null);
  assert.equal(parseBankEmail('Exclusive offer\nGet ₹500 cashback credited on your next purchase. Limited period offer.\nAmount ₹500\nReference No OFFER2026X1'), null);
  assert.equal(parseBankEmail('Payment reminder\nYour EMI of ₹4,500 is due on 5 Oct 2026.\nAmount ₹4,500\nReference No 4271001'), null);
});

test('transaction time: from the alert when it has one', () => {
  const { parseTime } = sms;
  assert.equal(parseTime('on 18-09-2026 14:22:11.'), '14:22');
  assert.equal(parseTime('Oct 3, 2026 09:15 AM'), '09:15');
  assert.equal(parseTime('at 1:06 pm'), '13:06');
  assert.equal(parseTime('12:30 AM'), '00:30');
  assert.equal(parseTime('30.09.2026'), null, 'a dotted date is not a time');
  assert.equal(parseTime('Rs 09.15 debited'), null, 'nor is an amount');
  assert.equal(parseTime('no time here'), null);

  const card = parseBankEmail(`Card alert
Thank you for using your HDFC Bank Credit Card ending 4321 for Rs 1,180.00 at IRCTC on 18-09-2026 14:22:11.`);
  assert.equal(card.time, '14:22');
  const upi = parseBankEmail(`You received money
₹2,000 credited to your account.
Received from PRIYA NAIR
UPI Ref No 627598765432
Date & Time Oct 3, 2026 09:15 AM`);
  assert.equal(upi.time, '09:15');
  const slice = parseBankEmail('₹20 debited from your slice bank account xx8002 via UPI.\nTransaction date 02-Oct-26\nTo ISTHARA PARKS PRIVATE LIMITED\nRRN 627574346774');
  assert.equal(slice.time, null, 'no time in the text: Gmail uses when the email arrived');
});

test('credit card bills: total due, minimum, due date and card, from sentences or tables', () => {
  const sentence = parseCardBill(`Your HDFC Bank Credit Card Statement for September 2026
Dear Customer, the statement for your HDFC Bank Credit Card ending 4321 is attached.
Total Amount Due: Rs. 12,450.50 Minimum Amount Due: Rs. 630.00
Payment Due Date: 15/10/2026`);
  assert.deepEqual(sentence, { totalDue: 12450.5, minDue: 630, dueDate: '2026-10-15', last4: '4321' });

  const table = parseCardBill(`slice card bill generated
Hi Tejasv, your bill is ready.
Card XX8802
Total amount due ₹3,210.00
Minimum due ₹161.00
Due date 05 Nov 2026`);
  assert.deepEqual(table, { totalDue: 3210, minDue: 161, dueDate: '2026-11-05', last4: '8802' });

  const icici = parseCardBill('ICICI Bank Credit Card Statement\nYour statement for card XXXX9876 dated Sep 25, 2026. Total Dues: INR 8,000.00. Minimum Due: INR 400.00. Due by Oct 13, 2026.');
  assert.deepEqual([icici.totalDue, icici.minDue, icici.dueDate, icici.last4], [8000, 400, '2026-10-13', '9876']);

  assert.equal(parseCardBill('Your e-statement is attached. Please find the password in the email.'), null, 'amounts only in the PDF');
  assert.equal(parseCardBill('Rs.250.00 has been debited from account **1234 to VPA zomato@hdfcbank on 01-10-26.'), null, 'an alert is not a bill');
});

test('card payment confirmations are recognised (they close the bill reminder)', () => {
  assert.ok(isCardPaymentReceived('Payment received\nThank you for your payment of Rs 12,450.50 towards your HDFC Bank Credit Card ending 4321.'));
  assert.ok(isCardPaymentReceived('We have received a payment of ₹3,210 for your slice card.'));
  assert.ok(!isCardPaymentReceived('₹2,000 credited to your savings account. Received from PRIYA NAIR.'), 'money into a bank account is not a card payment');
});
