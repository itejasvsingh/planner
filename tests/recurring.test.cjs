const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/recurring.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { billsToGenerate } = mod.exports;

const bill = (id, title, date, extra = {}) => ({ id, type: 'expense', title, amount: 28000, date, category: 'Rent', isRecurring: true, recurringFrequency: 'monthly', ...extra });
const oct10 = new Date(2026, 9, 10);

test('rent logged by hand in Aug and Sep produces a single October copy', () => {
  const out = billsToGenerate([bill('a', 'Rent', '2026-08-05'), bill('b', 'Rent', '2026-09-05')], oct10);
  assert.equal(out.length, 1);
  assert.equal(out[0].recurringParentId, 'b');
  assert.equal(out[0].date, '2026-10-05');
});

test('nothing is generated when the bill is already in this month', () => {
  assert.equal(billsToGenerate([bill('a', 'Rent', '2026-09-05'), bill('g', 'Rent', '2026-10-05', { isGeneratedRecurring: true, recurringParentId: 'a' })], oct10).length, 0);
  // paid by hand this month with the toggle on
  assert.equal(billsToGenerate([bill('a', 'Rent', '2026-09-05'), bill('c', 'rent ', '2026-10-02')], oct10).length, 0);
});

test('bills due later this month land on the 1st; day 31 clamps to short months', () => {
  assert.equal(billsToGenerate([bill('a', 'Gym', '2026-09-20')], oct10)[0].date, '2026-10-01');
  assert.equal(billsToGenerate([bill('a', 'Gym', '2026-08-31')], new Date(2026, 8, 30))[0].date, '2026-09-30');
});

test('generated copies are never templates; non-monthly and non-recurring are ignored', () => {
  const items = [
    bill('g', 'Rent', '2026-09-05', { isGeneratedRecurring: true, recurringParentId: 'x' }),
    bill('w', 'Milk', '2026-09-05', { recurringFrequency: 'weekly' }),
    { id: 'n', type: 'expense', title: 'Coffee', date: '2026-09-05', amount: 100 },
  ];
  assert.equal(billsToGenerate(items, oct10).length, 0);
});
