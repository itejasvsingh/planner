const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, toCsv, setOf, wilson, metrics, costPer1000 } = require('../scripts/eval-categorize/lib.cjs');

test('csv round trip keeps commas, quotes and newlines', () => {
  const rows = [{ id: '1', text: 'Lunch, "Biryani"\nspecial 250', true_category: 'Food & Dining' }];
  assert.deepEqual(parseCsv(toCsv(rows, ['id', 'text', 'true_category'])), rows);
});

test('the tune/test split is stable and roughly even', () => {
  assert.equal(setOf('abc'), setOf('abc'));
  const tune = Array.from({ length: 400 }, (_, i) => setOf(`id${i}`)).filter(s => s === 'tune').length;
  assert.ok(tune > 150 && tune < 250, `tune count ${tune}`);
});

test('metrics: accuracy, per-category scores and confusions', () => {
  const pairs = [
    { truth: 'Food & Dining', pred: 'Food & Dining' }, { truth: 'Food & Dining', pred: 'Groceries' },
    { truth: 'Transport', pred: 'Transport' }, { truth: 'Transport', pred: 'transport ' }, { truth: 'Groceries', pred: 'Food & Dining' },
  ];
  const m = metrics(pairs);
  assert.equal(m.n, 5);
  assert.equal(m.accuracy, 3 / 5);
  const food = m.per.find(p => p.category === 'food & dining');
  assert.equal(food.recall, 1 / 2);
  assert.equal(food.precision, 1 / 2);
  assert.equal(m.confusions[0].count, 1);
});

test('wilson interval brackets the share and shrinks with more rows', () => {
  const [a, b] = wilson(340, 400);
  assert.ok(a < 0.85 && b > 0.85 && b - a < 0.08);
  assert.ok(wilson(34, 40)[1] - wilson(34, 40)[0] > b - a);
  assert.deepEqual(wilson(0, 0), [0, 0]);
});

test('cost per 1,000 from average tokens and per-million prices', () => {
  // 400 in, 40 out, 160 thinking at $0.30 / $2.50 per million
  const c = costPer1000({ input: 400, output: 40, thought: 160 }, { input: 0.3, output: 2.5 });
  assert.ok(Math.abs(c - ((400 * 0.3 + 200 * 2.5) * 1000) / 1e6) < 1e-9);
});
