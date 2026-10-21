const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/statement-summary.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { summarizeStatement, previousStatement, statementItems } = mod.exports;

const rec = (o) => ({ id: 'r', bankId: 'hdfc', bankName: 'HDFC Bank', kind: 'card', last4: '1234', state: 'ok', at: 1, ...o });
const items = [
  { id: '1', type: 'expense', title: 'Swiggy', amount: 400, date: '2026-09-25', category: 'Food & Dining', cardLast4: '1234' },
  { id: '2', type: 'expense', title: 'SWIGGY', amount: 300, date: '2026-10-02', category: 'Food & Dining', cardLast4: '1234' },
  { id: '3', type: 'expense', title: 'Amazon', amount: 1500, date: '2026-10-10', category: 'Shopping', cardLast4: '1234' },
  { id: '4', type: 'income', title: 'Refund', amount: 200, date: '2026-10-11', cardLast4: '1234' },
  { id: '5', type: 'expense', title: 'Other card', amount: 999, date: '2026-10-05', cardLast4: '9999' },
  { id: '6', type: 'expense', title: 'Outside', amount: 50, date: '2026-10-25', cardLast4: '1234' },
  { id: '7', type: 'expense', title: 'Left out', amount: 70, date: '2026-10-05', cardLast4: '1234', excluded: true },
  { id: '8', type: 'expense', title: 'Last month', amount: 1100, date: '2026-09-10', cardLast4: '1234', category: 'Shopping' },
];

test('a statement summary: only that card, inside its dates; categories, shops, biggest', () => {
  const r = rec({ id: 'oct', from: '2026-09-21', to: '2026-10-20' });
  const s = summarizeStatement(items, r);
  assert.deepEqual([s.spent, s.received, s.count], [2200, 200, 3]);
  assert.deepEqual(s.categories.map(c => [c.name, c.total]), [['Shopping', 1500], ['Food & Dining', 700]]);
  assert.deepEqual(s.shops.map(c => [c.name, c.total, c.count]), [['Amazon', 1500, 1], ['Swiggy', 700, 2]]);
  assert.deepEqual(s.biggest, { title: 'Amazon', amount: 1500, date: '2026-10-10' });
  assert.equal(s.change, null);
});

test('change from the previous statement of the same card', () => {
  const oct = rec({ id: 'oct', from: '2026-09-21', to: '2026-10-20' });
  const sep = rec({ id: 'sep', from: '2026-08-21', to: '2026-09-20' });
  const other = rec({ id: 'x', last4: '9999', from: '2026-08-21', to: '2026-09-20' });
  assert.equal(previousStatement([oct, sep, other], oct).id, 'sep');
  assert.equal(summarizeStatement(items, oct, sep).change, 1, 'spent ₹2,200 vs ₹1,100: double');
  assert.equal(previousStatement([oct], oct), null);
  assert.deepEqual(statementItems(items, rec({ last4: null, from: '2026-01-01', to: '2026-12-31' })), [], 'no card number: nothing to match');
});
