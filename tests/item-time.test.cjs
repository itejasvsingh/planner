const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/planner-item.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
const { itemTime } = mod.exports;

test('a transaction keeps the time the bank gave', () => {
  assert.equal(itemTime({ id: 'a', type: 'expense', time: '13:06', createdAt: { seconds: 0 } }), '13:06');
});

test('older hand-added items use when they were added, from a Firestore Timestamp or a string', () => {
  const at = new Date(2026, 9, 3, 9, 5);
  assert.equal(itemTime({ id: 'b', type: 'expense', createdAt: { toDate: () => at } }), '09:05');
  assert.equal(itemTime({ id: 'c', type: 'income', createdAt: { seconds: at.getTime() / 1000, nanoseconds: 0 } }), '09:05');
  assert.equal(itemTime({ id: 'd', type: 'expense', createdAt: at.toISOString() }), '09:05');
});

test('never "Invalid Date"; statement and automatic rows get no made-up time', () => {
  assert.equal(itemTime({ id: 'e', type: 'expense', createdAt: { weird: true } }), null);
  assert.equal(itemTime({ id: 'f', type: 'expense', createdAt: 'not a date' }), null);
  assert.equal(itemTime({ id: 'g', type: 'expense', source: 'statement', createdAt: { seconds: 1 } }), null);
  assert.equal(itemTime({ id: 'h', type: 'expense', autoDetected: true, createdAt: { seconds: 1 } }), null);
});
