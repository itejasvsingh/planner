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
  // Every card with something to pay is listed, even one due after the two weeks; bills only within the two weeks
  assert.deepEqual(r.map(x => [x.date, x.title]), [['2026-10-18', 'Axis ••9999 bill'], ['2026-12-01', 'Far bill']], 'rent is already added as a real expense, wifi (28th) and gym (5th) are not due within 14 days');
  const r2 = upcomingPayments(items.filter(i => i.id !== 'gen'), [], now);
  assert.deepEqual(r2.map(x => [x.date, x.title]), [['2026-10-15', 'Rent']]);
});

test('payments between two days: every month/week occurrence, no doubles, card dues even when overdue', () => {
  const { paymentsBetween } = mod.exports;
  const rent = { id: 'r', type: 'expense', title: 'Rent', amount: 9000, date: '2026-06-18', isRecurring: true, recurringFrequency: 'monthly' };
  const gym = { id: 'g', type: 'expense', title: 'Gym', amount: 500, date: '2026-10-01', isRecurring: true, recurringFrequency: 'weekly' };
  const later = { id: 'l', type: 'expense', title: 'Later', amount: 1, date: '2027-01-05', isRecurring: true, recurringFrequency: 'monthly' };
  const generated = { id: 'x', type: 'expense', title: 'Rent', date: '2026-10-18', recurringParentId: 'r', isGeneratedRecurring: true };
  const cards = [
    { title: 'Axis', dueDate: '2026-10-12', outstanding: 5700, status: 'overdue' },
    { title: 'HDFC', dueDate: '2026-10-25', outstanding: 0, status: 'due' },
    { title: 'SBI', dueDate: '2026-10-20', outstanding: 300, status: 'paid' },
    { title: 'ICICI', dueDate: '2026-11-02', outstanding: 800, status: 'due' },
  ];
  const r = paymentsBetween([rent, gym, later], cards, '2026-10-01', '2026-10-31');
  assert.deepEqual(r.filter(x => x.title === 'Rent').map(x => x.date), ['2026-10-18']);
  assert.deepEqual(r.filter(x => x.title === 'Gym').map(x => x.date), ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
  assert.equal(r.some(x => x.title === 'Later'), false);
  assert.deepEqual(r.filter(x => x.kind === 'card').map(x => [x.title, x.date]), [['Axis bill', '2026-10-12']]);
  // Rent already added as a real expense on the 18th: not listed again
  assert.equal(paymentsBetween([rent, generated], [], '2026-10-01', '2026-10-31').length, 0);
});

test('coming up lists every unpaid card, overdue first, each with an urgency colour', () => {
  const { dueTone } = mod.exports;
  const cards = [
    { title: 'Later', dueDate: '2026-11-20', outstanding: 900, status: 'due' },
    { title: 'Soon', dueDate: '2026-10-16', outstanding: 500, status: 'due' },
    { title: 'Late', dueDate: '2026-10-10', outstanding: 7000, status: 'overdue' },
    { title: 'Paid', dueDate: '2026-10-12', outstanding: 800, status: 'paid' },
  ];
  const r = upcomingPayments([], cards, now);
  assert.deepEqual(r.map(x => [x.title, x.tone]), [['Late bill', 'overdue'], ['Soon bill', 'soon'], ['Later bill', 'later']]);
  assert.deepEqual([dueTone('2026-10-13', now), dueTone('2026-10-16', now), dueTone('2026-10-17', now), dueTone('2026-10-12', now)], ['soon', 'soon', 'later', 'overdue'], 'today to 3 days ahead is soon');
});

test('time-relative due wording (colour is not the only signal)', () => {
  const { dueRelative } = mod.exports;
  assert.deepEqual(['2026-10-13', '2026-10-14', '2026-10-18', '2026-10-12', '2026-10-10'].map(d => dueRelative(d, now)), ['today', 'tomorrow', 'in 5 days', '1 day overdue', '3 days overdue']);
});
