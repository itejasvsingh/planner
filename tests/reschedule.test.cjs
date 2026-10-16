const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/reschedule.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { moveOptions } = mod.exports;
const keys = (o) => o.map(x => `${x.label}:${x.key}`);

test('midweek: tomorrow, the coming Saturday, next Monday', () => {
  // Wed 2026-10-14
  assert.deepEqual(keys(moveOptions('2026-10-14', '2026-10-14')), ['Tomorrow:2026-10-15', 'This weekend:2026-10-17', 'Next week:2026-10-19']);
});

test('an overdue task can also come to today; the day it is on is never offered', () => {
  assert.deepEqual(keys(moveOptions('2026-10-14', '2026-10-10')), ['Today:2026-10-14', 'Tomorrow:2026-10-15', 'This weekend:2026-10-17', 'Next week:2026-10-19']);
  assert.deepEqual(keys(moveOptions('2026-10-14', '2026-10-15')), ['This weekend:2026-10-17', 'Next week:2026-10-19']);
});

test('Friday, Saturday, Sunday: no duplicate days, always in the future', () => {
  // Fri 2026-10-16: Saturday is tomorrow
  assert.deepEqual(keys(moveOptions('2026-10-16', null)), ['Tomorrow:2026-10-17', 'Next week:2026-10-19']);
  // Sat 2026-10-17: weekend is a week away; Monday is in two days
  assert.deepEqual(keys(moveOptions('2026-10-17', null)), ['Tomorrow:2026-10-18', 'This weekend:2026-10-24', 'Next week:2026-10-19']);
  // Sun 2026-10-18: Monday is tomorrow
  assert.deepEqual(keys(moveOptions('2026-10-18', null)), ['Tomorrow:2026-10-19', 'This weekend:2026-10-24']);
});

test('month and year ends roll over', () => {
  assert.deepEqual(keys(moveOptions('2026-12-31', null))[0], 'Tomorrow:2027-01-01');
});
