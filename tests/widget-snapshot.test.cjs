const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the two pure modules the way the other unit tests do (no bundler)
const load = (name, deps = {}) => {
  const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib', name), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, (p) => deps[p]);
  return mod.exports;
};
const analysis = load('finance-analysis.ts');
const { buildWidgetSnapshot } = load('widget-snapshot.ts', { './finance-analysis': analysis });

const now = new Date(2026, 9, 12, 9, 0); // Mon 12 Oct 2026
const t = (id, title, dueDate, extra = {}) => ({ id, type: 'task', title, dueDate, done: false, ...extra });

test('widget snapshot: today, overdue, next tasks and money', () => {
  const items = [
    t('1', 'Pay rent', '2026-10-12', { dueTime: '18:00' }),
    t('2', 'Call dentist', '2026-10-12'),
    t('3', 'Gym', '2026-10-12', { dueTime: '07:30' }),
    t('4', 'Old thing', '2026-10-09'),
    t('5', 'Done thing', '2026-10-12', { done: true }),
    t('6', 'Tomorrow', '2026-10-13'),
    { id: 'i', type: 'income', amount: 85000, date: '2026-10-05', category: 'Salary' },
    { id: 'e1', type: 'expense', amount: 420, date: '2026-10-12', category: 'Food' },
    { id: 'e2', type: 'expense', amount: 1000, date: '2026-10-08', category: 'Shopping' },
    { id: 'c', type: 'expense', amount: 5000, date: '2026-10-09', category: 'Card payment' },
  ];
  const s = buildWidgetSnapshot(items, 1, now);
  assert.equal(s.todayCount, 3);
  assert.equal(s.overdue, 1);
  assert.deepEqual(s.next.map(n => n.title), ['Gym', 'Pay rent', 'Call dentist'], 'timed tasks first, in time order');
  assert.equal(s.spentToday, 420);
  assert.equal(s.left, 85000 - 420 - 1000, 'a card bill payment is not spending');
});

test('widget snapshot: empty account has no money line', () => {
  const s = buildWidgetSnapshot([], 1, now);
  assert.equal(s.left, null);
  assert.equal(s.todayCount, 0);
});
