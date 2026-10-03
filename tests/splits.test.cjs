const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/splits.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { buildSplit, draftFrom, splitOf, friendBalances, settleUpPatches, recentFriends, equalShares, describeSplit, emptyDraft } = mod.exports;

const draft = o => ({ ...emptyDraft(), ...o });

test('equal shares add up to the paisa', () => {
  assert.deepEqual(equalShares(100, 3), [33.34, 33.33, 33.33]);
  assert.deepEqual(equalShares(1200, 3), [400, 400, 400]);
});

test('you paid ₹1,200 dinner for three, equally', () => {
  const { split } = buildSplit(1200, draft({ friends: ['Rahul', 'Priya'] }));
  assert.equal(split.yourShare, 400);
  assert.deepEqual(split.people.map(p => [p.name, p.share]), [['Rahul', 400], ['Priya', 400]]);
  assert.deepEqual(describeSplit(split), ['Rahul owes you ₹400', 'Priya owes you ₹400']);
});

test('exact amounts must add up to the total', () => {
  assert.equal(buildSplit(1000, draft({ friends: ['A'], method: 'exact', exact: { you: '300', A: '600' } })).error, '₹100 still to assign');
  assert.equal(buildSplit(1000, draft({ friends: ['A'], method: 'exact', exact: { you: '300', A: '800' } })).error, '₹100 more than the total');
  const { split } = buildSplit(1000, draft({ friends: ['A'], method: 'exact', exact: { you: '300', A: '700' } }));
  assert.deepEqual([split.yourShare, split.people[0].share], [300, 700]);
});

test('percentages must make 100%, and shares add up exactly', () => {
  assert.equal(buildSplit(999, draft({ friends: ['A', 'B'], method: 'percent', percent: { you: '50', A: '25' } })).error, '25% still to assign');
  const { split } = buildSplit(999, draft({ friends: ['A', 'B'], method: 'percent', percent: { you: '33.33', A: '33.33', B: '33.34' } }));
  const sum = Math.round((split.yourShare + split.people.reduce((s, p) => s + p.share, 0)) * 100);
  assert.equal(sum, 99900);
  assert.equal(split.people[1].percent, 33.34);
});

test('needs a total and a friend', () => {
  assert.ok(buildSplit(0, draft({ friends: ['A'] })).error);
  assert.equal(buildSplit(100, draft({ friends: ['  '] })).error, 'Add at least one friend to split with');
});

test('a friend paid: you owe them your share, others owe nothing to you', () => {
  const { split } = buildSplit(900, draft({ friends: ['Rahul', 'Priya'], paidBy: 'Rahul' }));
  assert.deepEqual(describeSplit(split), ['You owe Rahul ₹300']);
  const items = [{ id: 'x', type: 'expense', title: 'Cab', date: '2026-10-01', amount: 300, split }];
  const b = friendBalances(items);
  assert.deepEqual(b.map(f => [f.name, f.net]), [['Rahul', -300], ['Priya', 0]]);
});

test('balances net out across expenses and settle up clears them', () => {
  const a = buildSplit(1200, draft({ friends: ['Rahul', 'Priya'] })).split;
  const b = buildSplit(500, draft({ friends: ['rahul'], paidBy: 'rahul' })).split;
  const items = [
    { id: '1', type: 'expense', title: 'Dinner', date: '2026-10-01', amount: 400, split: a },
    { id: '2', type: 'expense', title: 'Movie', date: '2026-10-02', amount: 250, split: b },
    { id: '3', type: 'income', title: 'x', amount: 5, split: a },
  ];
  const bal = friendBalances(items);
  assert.deepEqual(bal.map(f => [f.name, f.net, f.open.length]), [['Priya', 400, 1], ['rahul', 150, 2]]);
  assert.deepEqual(recentFriends(items), ['rahul', 'Priya']);
  const patches = settleUpPatches(items, 'Rahul');
  assert.equal(patches.length, 2);
  const after = items.map(i => { const p = patches.find(x => x.id === i.id); return p ? { ...i, split: p.split } : i; });
  assert.deepEqual(friendBalances(after).map(f => [f.name, f.net]), [['Priya', 400], ['rahul', 0]]);
  assert.equal(settleUpPatches(after, 'Rahul').length, 0, 'nothing left to settle');
});

test('editing keeps settled marks when who-paid is unchanged', () => {
  const s = buildSplit(1200, draft({ friends: ['A', 'B'] })).split;
  s.people[0].settled = true;
  const again = buildSplit(1500, draftFrom(s), s).split;
  assert.deepEqual(again.people.map(p => [p.name, p.share, !!p.settled]), [['A', 500, true], ['B', 500, false]]);
  const otherPayer = buildSplit(1500, { ...draftFrom(s), paidBy: 'A' }, s).split;
  assert.equal(otherPayer.people[0].settled, undefined);
});

test('reads the older split shapes', () => {
  const one = splitOf({ amount: 300, split: { totalAmount: 800, splitWith: 'Sam', yourShare: 300, paidBy: 'you', settled: false } });
  assert.deepEqual([one.paidBy, one.yourShare, one.people[0].share], ['you', 300, 500]);
  const theyPaid = splitOf({ amount: 300, split: { totalAmount: 800, splitWith: 'Sam', yourShare: 300, paidBy: 'them', settled: false } });
  assert.equal(theyPaid.paidBy, 'Sam');
  const list = splitOf({ amount: 100, splits: [{ name: 'Kim', amount: 100, settled: false }] });
  assert.deepEqual([list.total, list.people[0].name], [200, 'Kim']);
  assert.equal(splitOf({ amount: 5, splits: [] }), null);
});
