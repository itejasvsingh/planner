const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const src = fs.readFileSync(path.join(__dirname, '../lib/investParse.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { parseInvestment, nameWords } = mod.exports;

test('a purchase confirmation gives fund, amount, units and NAV', () => {
  const e = parseInvestment('Your purchase of Rs. 5,000.00 in HDFC Flexi Cap Fund - Direct Plan - Growth has been processed. Units allotted: 2.356 at NAV Rs 2121.91. Order No: ABC123456');
  assert.equal(e.kind, 'buy');
  assert.match(e.name, /^HDFC Flexi Cap Fund/);
  assert.deepEqual([e.amount, e.units, e.nav, e.ref], [5000, 2.356, 2121.91, 'ABC123456']);
});

test('a redemption is a sell', () => {
  const e = parseInvestment('Redemption request for 10.5 units of Axis Bluechip Fund Direct Growth processed. Amount Rs 1,200.50 will be credited.');
  assert.equal(e.kind, 'sell');
  assert.equal(e.units, 10.5);
});

test('offers, OTPs and plain bank alerts are not investments', () => {
  assert.equal(parseInvestment('Rs.250.00 debited from account **1234 to VPA zomato@hdfcbank on 01-10-26.'), null);
  assert.equal(parseInvestment('Invest in our best Mutual Fund today! Special offer on SIP for you.'), null);
  assert.equal(parseInvestment('Your OTP for SIP in Parag Parikh Flexi Cap Fund is 123456'), null);
});

test('name words drop plan noise', () => {
  assert.deepEqual(nameWords('HDFC Flexi Cap Fund - Direct Plan - Growth'), ['hdfc', 'flexi', 'cap', 'direct', 'growth']);
});
