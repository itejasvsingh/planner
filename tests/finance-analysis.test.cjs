const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/finance-analysis.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const a = mod.exports;

const exp = (id, date, amount, category = 'Food', extra = {}) => ({ id, type: 'expense', date, amount, category, ...extra });
const inc = (id, date, amount) => ({ id, type: 'income', date, amount, category: 'Salary' });
const fmt = n => `₹${n}`;

test('cycle uses local dates and includes its last day', () => {
  const c = a.cycleRange(1, 0, new Date(2026, 8, 30, 23, 30));
  assert.equal(c.startKey, '2026-09-01');
  assert.equal(c.endKey, '2026-10-01');
  assert.equal(c.days, 30);
  assert.equal(a.inRange(exp('x', '2026-09-30', 1), c.startKey, c.endKey), true);
  assert.equal(a.inRange(exp('y', '2026-08-31', 1), c.startKey, c.endKey), false);
});

test('mid-month payday: before payday belongs to the previous cycle', () => {
  const c = a.cycleRange(25, 0, new Date(2026, 9, 10));
  assert.equal(c.startKey, '2026-09-25');
  assert.equal(c.endKey, '2026-10-25');
  const prev = a.cycleRange(25, -1, new Date(2026, 9, 10));
  assert.equal(prev.startKey, '2026-08-25');
  assert.equal(prev.endKey, '2026-09-25');
});

test('payday 31 clamps to short months and crosses the year', () => {
  const c = a.cycleRange(31, 0, new Date(2026, 1, 28));
  assert.equal(c.startKey, '2026-02-28');
  assert.equal(c.endKey, '2026-03-31');
  const jan = a.cycleRange(1, -1, new Date(2026, 0, 15));
  assert.equal(jan.startKey, '2025-12-01');
  assert.equal(jan.endKey, '2026-01-01');
});

test('summary, savings rate and category shares', () => {
  const txns = [inc('i', '2026-09-01', 10000), exp('a', '2026-09-02', 3000, 'Food'), exp('b', '2026-09-03', 1000, 'Cabs'), { id: 't', type: 'transfer', date: '2026-09-03', amount: 500 }];
  const s = a.summarize(txns);
  assert.deepEqual([s.spent, s.income, s.net, s.expenseCount], [4000, 10000, 6000, 2]);
  assert.equal(s.savingsRate, 0.6);
  const cats = a.byCategory(txns, t => t.category);
  assert.deepEqual(cats.map(c => [c.name, c.amount, c.share]), [['Food', 3000, 0.75], ['Cabs', 1000, 0.25]]);
});

test('daily series covers every day including zeros', () => {
  const c = a.cycleRange(1, 0, new Date(2026, 1, 10));
  const series = a.dailySeries([exp('a', '2026-02-03', 50), exp('b', '2026-02-03', 25)], c);
  assert.equal(series.length, 28);
  assert.equal(series[2].key, '2026-02-03');
  assert.equal(series[2].amount, 75);
  assert.equal(series[0].amount, 0);
});

test('weekday totals and top expenses', () => {
  // 2026-10-03 is a Saturday
  const wd = a.weekdayTotals([exp('a', '2026-10-03', 100), exp('b', '2026-10-04', 40)]);
  assert.equal(wd[6], 100);
  assert.equal(wd[0], 40);
  assert.deepEqual(a.topExpenses([exp('a', 'x', 5), exp('b', 'x', 50), exp('c', 'x', 20)], 2).map(t => t.id), ['b', 'c']);
});

test('cycle trend lists cycles oldest first', () => {
  const trend = a.cycleTrend([exp('a', '2026-08-15', 300), exp('b', '2026-09-15', 100)], 1, 3, 0, new Date(2026, 8, 20));
  assert.deepEqual(trend.map(t => [t.cycle.startKey, t.spent]), [['2026-07-01', 0], ['2026-08-01', 300], ['2026-09-01', 100]]);
});

test('insights compare against the same stretch of the previous cycle', () => {
  const cycle = a.cycleRange(1, 0, new Date(2026, 8, 10));
  const current = [exp('a', '2026-09-02', 2000, 'Food'), exp('b', '2026-09-05', 500, 'Cabs'), inc('i', '2026-09-01', 10000)];
  const previousToDate = [exp('c', '2026-08-03', 1000, 'Food'), exp('d', '2026-08-04', 1500, 'Cabs')];
  const ins = a.buildInsights({ current, previousToDate, nameOf: t => t.category, cycle, inProgress: true, now: new Date(2026, 8, 10), format: fmt });
  const text = ins.map(i => i.text).join(' | ');
  assert.match(text, /level with last cycle/);
  assert.match(text, /Food is 80% of your spending/);
  assert.match(text, /Food is up ₹1000 \(100%\)/);
  assert.match(text, /about ₹7500 this cycle \(₹250\/day plus bills\)/);
  assert.match(text, /kept 75% of your income/);
});

test('no insights without expenses; overspending is flagged', () => {
  const cycle = a.cycleRange(1, 0, new Date(2026, 8, 10));
  assert.deepEqual(a.buildInsights({ current: [], previousToDate: [], nameOf: t => t.category, cycle, inProgress: true, format: fmt }), []);
  const over = a.buildInsights({ current: [inc('i', '2026-09-01', 100), exp('a', '2026-09-02', 300)], previousToDate: [], nameOf: t => t.category, cycle, inProgress: false, format: fmt });
  assert.ok(over.some(i => i.tone === 'bad' && /₹200 more than you earned/.test(i.text)));
});

test('pace counts recurring bills once instead of spreading them over the days', () => {
  const cycle = a.cycleRange(1, 0, new Date(2026, 9, 5));
  const p = a.pace([exp('r', '2026-10-01', 28000, 'Rent', { isRecurring: true }), exp('f', '2026-10-02', 1000), exp('g', '2026-10-04', 500)], cycle, new Date(2026, 9, 5));
  assert.equal(p.elapsed, 5);
  assert.equal(p.perDay, 300);
  assert.equal(p.recurring, 28000);
  assert.equal(p.projected, 28000 + 300 * 31);
});

test('paying a card bill is not spending, but spending on the card is', () => {
  const rows = [exp('a', '2026-10-02', 500, 'Shopping'), exp('b', '2026-10-05', 5000, 'Card payment'), exp('c', '2026-10-06', 5000, 'Other', { title: 'HDFC Credit Card payment' }), exp('d', '2026-10-07', 200, 'Food', { title: 'Cardamom Cafe' })];
  assert.equal(a.summarize(rows).spent, 700);
  assert.equal(a.isMoney(rows[1]), true, 'still listed');
  assert.equal(a.byCategory(rows, t => t.category).find(c => c.name === 'Card payment'), undefined);
});

test('cumulative net: income less spending day by day, card bills and transfers left out, stops today', () => {
  const cycle = a.cycleRange(1, 0, new Date(2026, 9, 12));
  const rows = [
    inc('i', '2026-10-02', 1000),
    exp('e1', '2026-10-03', 200),
    exp('e2', '2026-10-03', 100),
    exp('cb', '2026-10-04', 5000, 'Card payment'),
    { id: 't', type: 'transfer', date: '2026-10-05', amount: 400, category: 'Self Transfer' },
    exp('future', '2026-10-20', 999),
  ];
  const s = a.cumulativeNet(rows, cycle, '2026-10-05');
  assert.equal(s.length, 5, 'Oct 1 to Oct 5 only');
  assert.deepEqual(s.map(p => p.net), [0, 1000, 700, 700, 700]);
});

test('left out of cash flow: listed, but in no total', () => {
  const items = [exp('a', '2026-10-02', 100), exp('b', '2026-10-03', 900, 'Food', { excluded: true }), inc('c', '2026-10-01', 5000), { ...inc('d', '2026-10-04', 700), excluded: true }];
  assert.equal(a.isExpense(items[1]), false);
  assert.equal(a.isIncome(items[3]), false);
  assert.equal(a.isMoney(items[1]), true, 'still a transaction in the list');
  assert.equal(a.isMoney(items[3]), true);
  assert.equal(a.leftOutOfFlow(items[1]), true);
  assert.equal(a.leftOutOfFlow({ id: 't', type: 'transfer' }), true);
  assert.equal(a.leftOutOfFlow(items[0]), false);
  const s = a.summarize(items, '2026-10-01', '2026-11-01');
  assert.equal(s.spent, 100);
  assert.equal(s.income, 5000);
});

test('flag filters: bookmarked, untagged, no merchant; all chosen flags must hold', () => {
  const t = [
    { id: '1', type: 'expense', title: 'Swiggy', category: 'Food', bookmarked: true },
    { id: '2', type: 'expense', title: 'Payment', category: 'Other' },
    { id: '3', type: 'expense', title: '', category: 'Food' },
    { id: '4', type: 'income', title: 'Salary', category: '' },
    { id: '5', type: 'transfer', title: 'Myself', category: 'Self Transfer' },
    { id: '6', type: 'task', title: 'Call mom' },
  ];
  const ids = flags => t.filter(x => a.matchesFlags(x, flags)).map(x => x.id);
  assert.deepEqual(ids(['bookmarked']), ['1']);
  assert.deepEqual(ids(['untagged']), ['2', '4']);
  assert.deepEqual(ids(['nomerchant']), ['2', '3']);
  assert.deepEqual(ids(['untagged', 'nomerchant']), ['2']);
  assert.deepEqual(ids(['excluded']), ['5']);
  assert.deepEqual(ids([]), ['1', '2', '3', '4', '5', '6']);
});

test('CSV export: quotes, commas, and formula-looking cells', () => {
  const csv = a.toCsv([
    { id: '1', type: 'expense', date: '2026-10-02', time: '13:05', amount: 1500.5, title: 'Cafe, "Blue"', category: 'Food', bookmarked: true },
    { id: '2', type: 'expense', date: '2026-10-03', amount: 10, title: '=HYPERLINK("x")', category: 'Other', excluded: true },
  ], t => t.category);
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines[0], 'Date,Time,Type,Amount,Merchant,Category,Place,Bookmarked,Left out of cash flow');
  assert.equal(lines[1], '2026-10-02,13:05,expense,1500.5,"Cafe, ""Blue""",Food,,yes,');
  assert.ok(lines[2].includes(`"'=HYPERLINK(""x"")"`), lines[2]);
  assert.ok(lines[2].endsWith(',yes'));
});
