const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../lib/unparsedText.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { looksLikeTransaction, maskDigits } = mod.exports;

test('what counts as a payment message that should have been read', () => {
  assert.equal(looksLikeTransaction('Sent Rs.250.00 from Indian Bank A/c *1234 to SHOP on 05-10-26. Ref 627574346774'), true);
  assert.equal(looksLikeTransaction('INR 1,500 credited to your a/c XX1234 by UPI from FRIEND'), true);
  assert.equal(looksLikeTransaction('Your OTP is 482913 for a payment of Rs 500. Do not share.'), false, 'a code is not a payment');
  assert.equal(looksLikeTransaction('Get a pre-approved loan of Rs 5,00,000 credited in 10 minutes. Apply now'), false, 'an offer');
  assert.equal(looksLikeTransaction('Your credit card statement is ready. Minimum due Rs 200 paid by 05 Nov'), false, 'a statement notice');
  assert.equal(looksLikeTransaction('Rs 500 payment failed. Please try again'), false, 'a failed payment');
  assert.equal(looksLikeTransaction('Hello there'), false);
  assert.equal(looksLikeTransaction(''), false);
});

test('long numbers are hidden, amounts and dates stay, and the snippet is short', () => {
  assert.equal(maskDigits('Sent Rs.250.00 from A/c 1234567890 on 05-10-26 Ref 627574346774'), 'Sent Rs.250.00 from A/c •••••••••• on 05-10-26 Ref ••••••••••••');
  assert.equal(maskDigits('Card 4111111111111111  used   for Rs 99').includes('4111'), false);
  assert.equal(maskDigits('x'.repeat(500)).length, 200);
});
