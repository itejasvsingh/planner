const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/quick-parse.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { parseOffline } = mod.exports;
const T = '2026-10-02';

test('amounts with a currency become expenses', () => {
  assert.deepEqual(pick(parseOffline('₹40 chai', T)), ['expense', 'Chai', 40]);
  assert.deepEqual(pick(parseOffline('paid rs 1,250 for electricity', T)), ['expense', 'Electricity', 1250]);
  assert.deepEqual(pick(parseOffline('Uber 312 rupees', T)), ['expense', 'Uber', 312]);
});

test('short "thing amount" phrases become expenses', () => {
  assert.deepEqual(pick(parseOffline('lunch 250', T)), ['expense', 'Lunch', 250]);
  assert.deepEqual(pick(parseOffline('250 groceries', T)), ['expense', 'Groceries', 250]);
});

test('everything else becomes a task for today', () => {
  const t = parseOffline('call mom about the 25th', T);
  assert.equal(t.type, 'task');
  assert.equal(t.title, 'Call mom about the 25th');
  assert.equal(t.dueDate, T);
  assert.equal(parseOffline('2026', T).type, 'task');
  assert.equal(parseOffline('read chapter 12 of the book tonight', T).type, 'task');
});

function pick(d) { return [d.type, d.title, d.amount]; }
