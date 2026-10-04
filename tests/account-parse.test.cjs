const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const load = (file, req) => {
  const out = ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, req || (() => ({})));
  return mod.exports;
};
const banks = load('../lib/bankSenders.ts');
const { availableBalance, creditCardOf, cardPaymentAmount, bankFromText } = load('../lib/accountParse.ts', n => (n === './bankSenders' ? banks : {}));

test('available balance from account alerts', () => {
  assert.deepEqual(availableBalance('Rs.500.00 debited from A/c XX1234 on 03-10-26 to VPA x@ybl. Avl Bal Rs.12,345.67'), { balance: 12345.67, last4: '1234' });
  assert.deepEqual(availableBalance('Dear Customer, INR 2,000 credited to your account no. XXXXXX5678. Available Balance: INR 45,210.00'), { balance: 45210, last4: '5678' });
  assert.deepEqual(availableBalance('Your A/c balance is Rs 100'), { balance: 100, last4: null });
  assert.equal(availableBalance('Rs 500 spent on your HDFC Bank Credit Card ending 4321. Avl Lmt: Rs 45,000'), null);
  assert.equal(availableBalance('Rs 500 debited from A/c XX1234'), null);
});

test('credit card spends are tied to their card; debit cards and accounts are not', () => {
  assert.deepEqual(creditCardOf('Rs 1,250 spent on HDFC Bank Credit Card XX4321 at AMAZON on 2026-10-03'), { last4: '4321' });
  assert.deepEqual(creditCardOf('Thank you for using your ICICI Bank Credit Card ending 9876 for INR 499'), { last4: '9876' });
  assert.equal(creditCardOf('Rs 1,250 spent on your Debit Card XX4321'), null);
  assert.equal(creditCardOf('Rs 500 debited from A/c XX1234'), null);
});

test('amount in a card payment confirmation', () => {
  assert.equal(cardPaymentAmount('Thank you for your payment of Rs 12,450.50 towards your HDFC Bank Credit Card ending 4321.'), 12450.5);
  assert.equal(cardPaymentAmount('We have received INR 3,000.00 towards your card payment'), 3000);
  assert.equal(cardPaymentAmount('Thank you for your payment.'), null);
});

test('bank named in an SMS', () => {
  assert.equal(bankFromText('Rs 500 spent on SBI Card ending 1111').id, 'sbicard');
  assert.equal(bankFromText('Your SBI A/c X1234 debited').id, 'sbi');
  assert.equal(bankFromText('HDFC Bank: Rs 20 debited').name, 'HDFC Bank');
  assert.equal(bankFromText('Rs 20 paid via UPI'), null);
});

test('more ways banks state a balance', () => {
  assert.deepEqual(availableBalance('Kotak: Rs 200 debited from a/c xx9012. Avbl Bal: Rs 7,800.50'), { balance: 7800.5, last4: '9012' });
  assert.deepEqual(availableBalance('Dear Customer, balance in your A/c XX3456 is Rs.1,234.00 as on 03-10-2026'), { balance: 1234, last4: '3456' });
  assert.deepEqual(availableBalance('SBI: Your a/c no. XXXXX4321 Bal: INR 52,000.00 as of today'), { balance: 52000, last4: '4321' });
  assert.deepEqual(availableBalance('A/c *5555 Clr Bal Rs 900'), { balance: 900, last4: '5555' });
  assert.equal(availableBalance('Minimum balance charges of Rs 500 applied to your a/c XX1234'), null);
  assert.equal(availableBalance('Your loan outstanding balance is Rs 2,40,000'), null);
});

test('banks by sender: DCB, and any .bank.in address', () => {
  const { bankFromSender, bankNameById } = load('../lib/bankSenders.ts');
  assert.equal(bankFromSender('alerts@dcbbank.com').name, 'DCB Bank');
  assert.equal(bankFromSender('estatement@dcb.bank.in').id, 'dcb');
  assert.equal(bankFromSender('HDFC Bank <alerts@hdfcbank.bank.in>'.replace(/.*<|>/g, '')).id, 'hdfc');
  assert.deepEqual([bankFromSender('alerts@xyz.bank.in').id, bankFromSender('alerts@xyz.bank.in').name], ['in_xyz', 'XYZ Bank']);
  assert.equal(bankFromSender('statements@karurvysya.bank.in').name, 'Karurvysya Bank');
  assert.equal(bankNameById('in_kvbank'), 'KV Bank');
  assert.equal(bankFromSender('promo@shop.com'), null);
});
