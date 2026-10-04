// Cards & accounts on the Money screen: `npm run test:emulator`. No real email or bank data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';

const jiti = require('jiti')(__filename);
const { saveBill } = jiti(path.join(__dirname, '../../lib/cardBills.ts'));
const { recordTransaction, istParts } = jiti(path.join(__dirname, '../../lib/recordTransaction.ts'));
const { cardSummaries, accountBalances, recordCardPayment, saveBalance } = jiti(path.join(__dirname, '../../lib/moneyAccounts.ts'));
const { creditCardOf } = jiti(path.join(__dirname, '../../lib/accountParse.ts'));

const DAY = 86400000;
const P = '919800000301';
const day = (offset) => istParts(Date.now() + offset * DAY).date;

test('outstanding now = statement − payments since + card spends since', async () => {
  const stmtAt = Date.now() - 10 * DAY;
  await saveBill(P, { totalDue: 12000, minDue: 600, dueDate: day(8), last4: '4321' }, 'creditcards@hdfcbank.net', stmtAt);
  // spent on the card after the statement (and one on another card, and one before the statement)
  const alert = 'Rs 1,500 spent on HDFC Bank Credit Card XX4321 at AMAZON';
  await recordTransaction(P, { type: 'expense', amount: 1500, merchant: 'Amazon', category: 'Shopping', ref: null, date: null }, { source: 'gmail', dedupText: 'g1', date: day(-2), card: creditCardOf(alert) });
  await recordTransaction(P, { type: 'expense', amount: 999, merchant: 'Other card', category: 'Shopping', ref: null, date: null }, { source: 'gmail', dedupText: 'g2', date: day(-2), card: { last4: '9999' } });
  await recordTransaction(P, { type: 'expense', amount: 700, merchant: 'Before', category: 'Shopping', ref: null, date: null }, { source: 'gmail', dedupText: 'g3', date: day(-20), card: { last4: '4321' } });
  await recordCardPayment(P, 'hdfc', 5000, Date.now() - 1 * DAY);

  const [card] = await cardSummaries(P);
  assert.deepEqual(
    [card.issuerName, card.last4, card.statementDate, card.totalDue, card.paidSince, card.spentSince, card.outstanding, card.status, card.daysLeft],
    ['HDFC Bank', '4321', istParts(stmtAt).date, 12000, 5000, 1500, 8500, 'due', 8],
  );
});

test('paid in full: nothing left from the statement, only new spends', async () => {
  await recordCardPayment(P, 'hdfc', 7000, Date.now());
  const [card] = await cardSummaries(P);
  assert.deepEqual([card.status, card.outstanding], ['paid', 1500]);
});

test('the newest balance wins, whatever order alerts are read in', async () => {
  await saveBalance(P, { bankId: 'sbi', bankName: 'State Bank of India', last4: '1234', balance: 5000, at: 2000 });
  await saveBalance(P, { bankId: 'sbi', bankName: 'State Bank of India', last4: '1234', balance: 9999, at: 1000 });
  const [acc] = await accountBalances(P);
  assert.deepEqual([acc.bankName, acc.last4, acc.balance], ['State Bank of India', '1234', 5000]);
});
