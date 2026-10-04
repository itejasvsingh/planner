const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/overview90.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { overview90 } = mod.exports;

const TODAY = '2026-10-04';
let n = 0;
const t = (o) => ({ id: `x${++n}`, type: 'expense', category: 'Other', ...o });
const items = [
  // 61–90 days ago and 31–60 days ago: food 3,000 each; last 30 days: food 6,000 (+100%)
  t({ title: 'Zomato', amount: 3000, date: '2026-07-20', category: 'Food & Dining' }),
  t({ title: 'Zomato', amount: 3000, date: '2026-08-20', category: 'Food & Dining' }),
  t({ title: 'Zomato', amount: 2000, date: '2026-09-10', category: 'Food & Dining' }),
  t({ title: 'Zomato Ltd', amount: 4000, date: '2026-09-20', category: 'Food & Dining' }),
  // transport falls
  t({ title: 'Uber', amount: 5000, date: '2026-08-25', category: 'Transport' }),
  t({ title: 'Uber', amount: 1000, date: '2026-09-25', category: 'Transport' }),
  { id: 'i1', type: 'income', title: 'Salary', amount: 50000, date: '2026-10-01' },
  { id: 'tr', type: 'transfer', title: 'Mom', amount: 10000, date: '2026-10-02' },
  t({ title: 'Too old', amount: 99999, date: '2026-06-01' }),
];

test('totals, windows and transfers kept apart', () => {
  const o = overview90(items, TODAY, (x) => x.category);
  assert.deepEqual([o.from, o.to, o.spent, o.income, o.transfers], ['2026-07-07', '2026-10-04', 18000, 50000, 10000]);
  assert.deepEqual(o.months.map((m) => m.spent), [3000, 8000, 7000]);
  assert.equal(o.weeks.length, 13);
  assert.equal(o.weeks.reduce((s, w) => s + w.spent, 0), 18000);
});

test('categories with month-on-month change, top payees merged across spellings', () => {
  const o = overview90(items, TODAY, (x) => x.category);
  const food = o.categories.find((c) => c.name === 'Food & Dining');
  assert.deepEqual([food.amount, food.last30, food.prev30, food.changePct], [12000, 6000, 3000, 1]);
  assert.deepEqual(o.merchants[0], { title: 'Zomato', amount: 12000, count: 4 });
});

test('plain-language notes', () => {
  const text = overview90(items, TODAY, (x) => x.category).notes.map((n) => n.text).join('\n');
  assert.match(text, /Food & Dining is up 100%|Food & Dining is 2.0× what it was/);
  assert.match(text, /Transport is down 80%/);
  assert.match(text, /biggest spend is Food & Dining/);
  assert.match(text, /Most money went to Zomato/);
  assert.match(text, /₹10,000 went to family or your own accounts/);
});
