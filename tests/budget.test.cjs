const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/budget.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { summarizeBudget, categoryBudgets } = mod.exports;

test('10k budget, 3.8k spent, 10 days left', () => {
  const s = summarizeBudget(10000, 3800, new Date(2026, 9, 11), new Date(2026, 9, 1, 15, 0));
  assert.equal(s.left, 6200);
  assert.equal(s.daysLeft, 10);
  assert.equal(s.perDay, 620);
  assert.equal(s.status, 'ok');
});

test('warning at 80% and over budget', () => {
  assert.equal(summarizeBudget(10000, 8000, new Date(2026, 9, 11), new Date(2026, 9, 1)).status, 'warning');
  const over = summarizeBudget(10000, 11500, new Date(2026, 9, 11), new Date(2026, 9, 1));
  assert.equal(over.status, 'over');
  assert.equal(over.left, -1500);
  assert.equal(over.perDay, 0);
});

test('last day of cycle still counts as one day', () => {
  assert.equal(summarizeBudget(1000, 0, new Date(2026, 9, 2), new Date(2026, 9, 1, 23, 0)).daysLeft, 1);
});

test('category budgets read from cat: keys only', () => {
  assert.deepEqual(categoryBudgets({ monthlyBudget: 10000, 'cat:Food & Dining': 3000, 'cat:Shopping': 0, payday: 1 }), { 'Food & Dining': 3000 });
});
