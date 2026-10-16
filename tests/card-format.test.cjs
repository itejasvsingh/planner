const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/card-format.ts'), 'utf8').replace(/^import .*$/gm, '');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { nextStatement, cardNumbers } = mod.exports;

test('next statement is about a month after the last, clamped to short months', () => {
  assert.equal(nextStatement('2026-10-10'), '10 Nov');
  assert.equal(nextStatement('2026-01-31'), '28 Feb');
  assert.equal(nextStatement('2026-12-15'), '15 Jan');
  assert.equal(nextStatement(null), null);
  assert.equal(nextStatement('garbage'), null);
});

test('card numbers: billed is what is left of the statement; limit and left only with a limit', () => {
  assert.deepEqual(cardNumbers({ outstanding: 5000, spentSince: 1200, limit: 100000 }), { limit: 100000, billed: 3800, unbilled: 1200, outstanding: 5000, left: 95000 });
  assert.deepEqual(cardNumbers({ outstanding: 0, spentSince: 0, limit: null }), { limit: null, billed: 0, unbilled: 0, outstanding: 0, left: null });
  assert.equal(cardNumbers({ outstanding: 200000, spentSince: 0, limit: 150000 }).left, 0, 'never negative');
});

test('card strip: overdue is red, coming due is grey with the date, no statement waits, paid or hidden shows nothing', () => {
  const { cardStrip } = mod.exports;
  assert.deepEqual(cardStrip({ status: 'overdue', daysLeft: -5, dueDate: '2026-10-12', outstanding: 1000 }), { tone: 'overdue', text: '₹1,000 due 5 days ago' });
  assert.deepEqual(cardStrip({ status: 'overdue', daysLeft: -1, dueDate: '2026-10-16', outstanding: 50.5 }), { tone: 'overdue', text: '₹50.50 due 1 day ago' });
  assert.deepEqual(cardStrip({ status: 'due', daysLeft: 13, dueDate: '2026-06-30', outstanding: 1000 }), { tone: 'due', text: '₹1,000 due on 30 Jun' });
  assert.deepEqual(cardStrip({ status: 'due', daysLeft: 0, dueDate: '2026-10-17', outstanding: 900 }), { tone: 'due', text: '₹900 due today' });
  assert.deepEqual(cardStrip({ status: 'due', daysLeft: null, dueDate: null, outstanding: 1000 }), { tone: 'awaiting', text: 'Awaiting statement · about ₹1,000 so far' });
  assert.equal(cardStrip({ status: 'paid', daysLeft: 3, dueDate: '2026-10-20', outstanding: 0 }), null);
  assert.equal(cardStrip({ status: 'due', daysLeft: 3, dueDate: '2026-10-20', outstanding: 5, hidden: true }), null);
});
