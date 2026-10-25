const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const load = (f) => {
  const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib', f), 'utf8').replace(/^import .*$/gm, '');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', out)(mod, mod.exports);
  return mod.exports;
};
const { parseTags, tagsText, searchText, refundTargets, refundedFor, refundPatches } = load('refunds.ts');
const fa = load('finance-analysis.ts');

test('tags are cleaned, de-duplicated and capped', () => {
  assert.deepEqual(parseTags('#Trip, work  #trip  ##Goa!'), ['trip', 'work', 'goa']);
  assert.equal(parseTags('a b c d e f g h').length, 6);
  assert.equal(tagsText(['trip', 'work']), '#trip #work');
});

test('search covers note and tags', () => {
  const t = searchText({ title: 'Uber', amount: 385, note: 'airport ride', tags: ['trip'] }, 'Transport');
  assert.ok(t.includes('airport') && t.includes('#trip') && t.includes('transport'));
});

const items = [
  { id: 'e1', type: 'expense', title: 'Myntra', amount: 2000, date: '2026-10-10' },
  { id: 'e2', type: 'expense', title: 'Swiggy', amount: 300, date: '2026-10-20' },
  { id: 'r1', type: 'income', title: 'Myntra refund', amount: 500, date: '2026-10-22', refundOf: 'e1' },
];

test('refund targets list spends that can hold the refund first', () => {
  assert.deepEqual(refundTargets(items, 500).map(i => i.id), ['e1', 'e2']);
});

test('linking a refund recomputes the spend, capped at what it cost', () => {
  assert.equal(refundedFor(items, 'e1'), 500);
  assert.deepEqual(refundPatches(items, 'r2', null, 'e1', 700), [{ id: 'e1', patch: { refunded: 1200 } }]);
  assert.deepEqual(refundPatches(items, 'r1', 'e1', 'e2', 500), [
    { id: 'e1', patch: { refunded: 0 } },
    { id: 'e2', patch: { refunded: 300 } },
  ]);
  assert.deepEqual(refundPatches(items, 'r1', 'e1', null, 0), [{ id: 'e1', patch: { refunded: 0 } }]);
});

test('a refunded spend counts only what is left and the refund is not income', () => {
  assert.equal(fa.amountOf({ id: 'x', type: 'expense', amount: 2000, refunded: 500 }), 1500);
  assert.equal(fa.amountOf({ id: 'x', type: 'expense', amount: 300, refunded: 900 }), 0);
  assert.equal(fa.isIncome(items[2]), false);
  assert.equal(fa.isIncome({ id: 'y', type: 'income', amount: 10 }), true);
});
