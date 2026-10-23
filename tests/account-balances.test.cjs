const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/account-balances.ts'), 'utf8').replace(/^import .*$/gm, '');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { adjustBalances, recentForAccount, transactionsForAccount } = mod.exports;

const at = new Date('2026-10-10T09:00:00').getTime();
const acct = { id: 'a', bankId: 'hdfc', bankName: 'HDFC', last4: '1234', balance: 10000, at };
const card = { last4: '9999', issuerName: 'Axis', outstanding: 2000, paidSince: at };

test('balances: only what was recorded after the quoted balance is applied; card owed follows', () => {
  const items = [
    { id: '1', type: 'expense', cardLast4: '1234', date: '2026-10-11', amount: 500, title: 'Swiggy' },
    { id: '2', type: 'income', cardLast4: '1234', date: '2026-10-12', amount: 3000, title: 'Refund' },
    { id: '3', type: 'expense', cardLast4: '1234', date: '2026-10-09', amount: 999, title: 'Before the balance' },
    { id: '4', type: 'expense', cardLast4: '9999', date: '2026-10-11', amount: 700, title: 'Zomato' },
    { id: '5', type: 'transfer', cardLast4: '9999', date: '2026-10-12', amount: 1000, title: 'Card bill' },
  ];
  const r = adjustBalances([acct], [card], items);
  assert.equal(r.accounts[0].balance, 10000 - 500 + 3000);
  assert.equal(r.cards[0].outstanding, 2000 + 700 - 1000);
  assert.equal(r.totalBalance, 12500);
  assert.equal(r.netWorth, 12500 - 1700);
  assert.equal(acct.balance, 10000, 'inputs are not changed');
});

test('recent transactions for an account: newest first, only that account', () => {
  const items = [
    { id: '1', type: 'expense', cardLast4: '1234', date: '2026-10-11', amount: 1 },
    { id: '2', type: 'expense', cardLast4: '1234', date: '2026-10-13', amount: 2 },
    { id: '3', type: 'expense', cardLast4: '0000', date: '2026-10-14', amount: 3 },
    { id: '4', type: 'expense', cardLast4: '1234', date: '2026-10-12', amount: 4 },
  ];
  assert.deepEqual(recentForAccount(acct, items, 2).map(i => i.id), ['2', '4']);
});

test('balances: an unticked account stays listed but is left out of the total and net worth', () => {
  const other = { id: 'b', bankId: 'sbi', bankName: 'SBI', last4: '5555', balance: 4000, at, excluded: true };
  const r = adjustBalances([acct, other], [], []);
  assert.equal(r.accounts.length, 2);
  assert.equal(r.totalBalance, 10000);
  assert.equal(r.netWorth, 10000);
});

test('total series: sums the ticked accounts day by day, carries balances forward, ends at today\'s total', () => {
  const { totalSeries } = mod.exports;
  const a = { balance: 700, history: [{ d: '2026-10-01', b: 1000 }, { d: '2026-10-03', b: 800 }] };
  const b = { balance: 400, history: [{ d: '2026-10-02', b: 500 }] };
  const off = { balance: 9999, excluded: true, history: [{ d: '2026-10-01', b: 9999 }] };
  const s = totalSeries([a, b, off], '2026-10-04');
  assert.deepEqual(s, [
    { d: '2026-10-01', b: 1500 }, // b is carried back from its first point
    { d: '2026-10-02', b: 1500 },
    { d: '2026-10-03', b: 1300 },
    { d: '2026-10-04', b: 1100 }, // today = current balances (700 + 400)
  ]);
  assert.deepEqual(totalSeries([{ balance: 5 }], '2026-10-04'), []);
});

test('bank alerts (stored under the account number) move the live balance and show under the account', () => {
  const items = [
    // After the last quoted balance (10 Oct 09:00): money out, a transfer out, and money in
    { id: 'a1', type: 'expense', accountLast4: '1234', date: '2026-10-11', time: '10:00', amount: 400, title: 'Zomato' },
    { id: 'a2', type: 'transfer', accountLast4: '1234', date: '2026-10-11', time: '12:00', amount: 1000, title: 'Rent to landlord' },
    { id: 'a3', type: 'income', accountLast4: '1234', date: '2026-10-12', time: '09:00', amount: 5000, title: 'Salary' },
    // Already inside the quoted balance (before it), another account, and a card spend: none of them touch this account
    { id: 'a4', type: 'expense', accountLast4: '1234', date: '2026-10-09', time: '23:00', amount: 999, title: 'Before the balance' },
    { id: 'a5', type: 'expense', accountLast4: '5555', date: '2026-10-11', time: '10:00', amount: 123, title: 'Other account' },
    { id: 'a6', type: 'expense', cardLast4: '9999', date: '2026-10-11', time: '10:00', amount: 700, title: 'Axis card spend' },
  ];
  const r = adjustBalances([acct], [card], items);
  assert.equal(r.accounts[0].balance, 10000 - 400 - 1000 + 5000, 'bank spends and transfers are deducted live, income added');
  assert.equal(r.accounts[0].applied, 3, 'how many newer transactions were applied on top of the quoted balance');
  assert.equal(r.cards[0].outstanding, 2000 + 700, 'a card spend raises what the card owes, not the bank balance');
  assert.deepEqual(transactionsForAccount(acct, items).map(i => i.id), ['a3', 'a2', 'a1', 'a4'], 'every transaction of the account, newest first');
});
