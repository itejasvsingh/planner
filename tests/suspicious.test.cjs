const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/suspicious.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { findSuspicious } = mod.exports;

const TODAY = '2026-10-04';
let n = 0;
const tx = (o) => ({ id: `t${++n}`, type: 'expense', source: 'sms', autoDetected: true, date: '2026-10-01', time: '13:00', ...o });
// A normal history: many small spends over 3 months
const normal = [];
for (let d = 1; d <= 28; d++) {
  normal.push(tx({ title: 'Zomato', amount: 250 + (d % 5) * 20, date: `2026-07-${String(d).padStart(2, '0')}` }));
  normal.push(tx({ title: 'Uber', amount: 180 + (d % 4) * 15, date: `2026-08-${String(d).padStart(2, '0')}` }));
}

test('normal spending raises nothing', () => {
  assert.deepEqual(findSuspicious([...normal, tx({ title: 'Zomato', amount: 300, date: '2026-10-02' })], TODAY), []);
});

test('the same charge twice within minutes', () => {
  const a = tx({ title: 'Amazon', amount: 2499, date: '2026-10-03', time: '14:02' });
  const b = tx({ title: 'AMAZON', amount: 2499, date: '2026-10-03', time: '14:05', source: 'sms' });
  const f = findSuspicious([...normal, a, b], TODAY);
  assert.ok(f.length >= 1 && f[0].reasons[0].startsWith('Charged twice'));
});

test('a large first payment, a spike at a usual place, the small hours, foreign currency', () => {
  const items = [
    ...normal,
    tx({ title: 'Unknown Electronics', amount: 45000, date: '2026-10-02' }),
    tx({ title: 'Zomato', amount: 4200, date: '2026-10-02' }),
    tx({ title: 'Swiggy', amount: 900, date: '2026-10-03', time: '02:40' }),
    tx({ title: 'NETFLIX USD 15.49', amount: 1320, date: '2026-10-03' }),
  ];
  const byTitle = Object.fromEntries(findSuspicious(items, TODAY).map(f => [f.item.title, f.reasons.join(' | ')]));
  assert.match(byTitle['Unknown Electronics'], /First payment/);
  assert.match(byTitle['Unknown Electronics'], /Much bigger than your usual/);
  assert.match(byTitle['Zomato'], /you usually spend about/);
  assert.match(byTitle['Swiggy'], /middle of the night/);
  assert.match(byTitle['NETFLIX USD 15.49'], /international/);
});

test('never flags what you typed in, transfers, older than 30 days, or anything you reviewed', () => {
  const items = [
    ...normal,
    tx({ title: 'Big TV', amount: 60000, date: '2026-10-02', source: undefined, autoDetected: false }),
    tx({ title: 'Mom', amount: 50000, date: '2026-10-02', type: 'transfer' }),
    tx({ title: 'Old big one', amount: 60000, date: '2026-08-20' }),
    tx({ title: 'Reviewed big one', amount: 60000, date: '2026-10-02', review: 'mine' }),
  ];
  assert.deepEqual(findSuspicious(items, TODAY), []);
});
