const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/upcoming.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { nextDue, upcomingPayments } = mod.exports;

const now = new Date(2026, 9, 13); // Tue 13 Oct 2026
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('next due: monthly (incl. 31st in a short month), weekly, yearly, and a start date still ahead', () => {
  assert.equal(key(nextDue('2026-06-05', 'monthly', now)), '2026-11-05');
  assert.equal(key(nextDue('2026-06-15', 'monthly', now)), '2026-10-15');
  assert.equal(key(nextDue('2026-01-31', 'monthly', new Date(2026, 10, 20))), '2026-11-30');
  assert.equal(key(nextDue('2026-10-01', 'weekly', now)), '2026-10-15');
  assert.equal(key(nextDue('2025-10-20', 'yearly', now)), '2026-10-20');
  assert.equal(key(nextDue('2026-12-01', 'monthly', now)), '2026-12-01');
});

test('coming up: bills and card dues in the next 14 days, nothing doubled or irrelevant', () => {
  const items = [
    { id: 'rent', type: 'expense', title: 'Rent', amount: 9000, date: '2026-06-15', isRecurring: true, recurringFrequency: 'monthly' },
    { id: 'wifi', type: 'expense', title: 'WiFi', amount: 700, date: '2026-06-28', isRecurring: true },
    { id: 'gen', type: 'expense', title: 'Rent', amount: 9000, date: '2026-10-15', isRecurring: true, isGeneratedRecurring: true, recurringParentId: 'rent' },
    { id: 'old', type: 'expense', title: 'Gym', amount: 500, date: '2026-06-05', isRecurring: true },
  ];
  const cards = [
    { title: 'Axis ••9999', dueDate: '2026-10-18', outstanding: 4200 },
    { title: 'HDFC', dueDate: '2026-10-18', outstanding: 0 },
    { title: 'Hidden', dueDate: '2026-10-18', outstanding: 100, hidden: true },
    { title: 'Paid', dueDate: '2026-10-18', outstanding: 100, status: 'paid' },
    { title: 'Far', dueDate: '2026-12-01', outstanding: 100 },
  ];
  const r = upcomingPayments(items, cards, now);
  assert.deepEqual(r.map(x => [x.date, x.title]), [['2026-10-18', 'Axis ••9999 bill']], 'rent is already added as a real expense, wifi (28th) and gym (5th) are not due within 14 days');
  const r2 = upcomingPayments(items.filter(i => i.id !== 'gen'), [], now);
  assert.deepEqual(r2.map(x => [x.date, x.title]), [['2026-10-15', 'Rent']]);
});
