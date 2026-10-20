const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/splits.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { buildSplit, draftFrom, splitOf, friendBalances, settleUpPatches, recentFriends, equalShares, describeSplit, emptyDraft, weightedShares, settleAmountPatches, groupNames, inGroup, groupTotals, reminderText, groupDefaultDraft } = mod.exports;

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


test('by shares: two shares to one, a blank box counts as one, leftover paise go to the first people', () => {
  const draft2 = (o) => ({ ...emptyDraft(), ...o });
  const a = buildSplit(1200, draft2({ friends: ['Rahul'], method: 'shares', shares: { you: '2', Rahul: '1' } })).split;
  assert.deepEqual([a.yourShare, a.people[0].share, a.yourShares, a.people[0].shares], [800, 400, 2, 1]);
  const b = buildSplit(100, draft2({ friends: ['A', 'B'], method: 'shares', shares: {} })).split;
  assert.deepEqual([b.yourShare, b.people[0].share, b.people[1].share], [33.34, 33.33, 33.33]);
  assert.equal(buildSplit(100, draft2({ friends: ['A'], method: 'shares', shares: { you: '0', A: '0' } })).error, 'Give at least one person a share');
  assert.equal(buildSplit(100, draft2({ friends: ['A'], method: 'shares', shares: { you: '-1', A: '1' } })).error, 'Shares can’t be negative');
  assert.deepEqual(weightedShares(10, [1, 1, 1]).reduce((t, x) => t + Math.round(x * 100), 0), 1000);
  // editing again gives the same numbers back
  const again = buildSplit(1200, draftFrom(a)).split;
  assert.deepEqual([again.yourShare, again.people[0].share], [800, 400]);
});

test('a group name is kept (trimmed) and comes back when editing', () => {
  const draft2 = (o) => ({ ...emptyDraft(), ...o });
  const s = buildSplit(600, draft2({ friends: ['A'], group: '  Goa   trip ' })).split;
  assert.equal(s.group, 'Goa trip');
  assert.equal(draftFrom(s).group, 'Goa trip');
  assert.equal(buildSplit(600, draft2({ friends: ['A'] })).split.group, undefined);
});

test('paying part of what a friend owes settles the oldest splits first; the last can be part-paid', () => {
  const draft2 = (o) => ({ ...emptyDraft(), ...o });
  const mk = (id, date, total) => ({ id, type: 'expense', title: id, date, amount: total / 2, split: buildSplit(total, draft2({ friends: ['Rahul'] })).split });
  const items = [mk('B', '2026-10-05', 600), mk('A', '2026-10-01', 800)]; // Rahul owes 400 (A) + 300 (B)
  assert.equal(friendBalances(items)[0].net, 700);
  const { applied, patches } = settleAmountPatches(items, 'rahul', 500);
  assert.equal(applied, 500);
  const after = items.map(i => ({ ...i, split: (patches.find(p => p.id === i.id) || i).split }));
  const a = after.find(i => i.id === 'A').split.people[0];
  const b = after.find(i => i.id === 'B').split.people[0];
  assert.deepEqual([a.settled, b.paid, b.settled], [true, 100, undefined]);
  assert.equal(friendBalances(after)[0].net, 200);
  // more than owed is capped
  const all = settleAmountPatches(after, 'Rahul', 9999);
  assert.equal(all.applied, 200);
  const done = after.map(i => ({ ...i, split: (all.patches.find(p => p.id === i.id) || i).split }));
  assert.equal(friendBalances(done).filter(b => b.net !== 0).length, 0);
  assert.deepEqual(settleAmountPatches(items, 'Nobody', 50), { applied: 0, patches: [] });
  assert.equal(settleAmountPatches(items, 'Rahul', 0).applied, 0);
});

test('paying a friend back in instalments when they paid', () => {
  const draft2 = (o) => ({ ...emptyDraft(), ...o });
  const split = buildSplit(900, draft2({ friends: ['Rahul', 'Priya'], paidBy: 'Rahul' })).split; // you owe Rahul 300
  const items = [{ id: 'cab', type: 'expense', title: 'Cab', date: '2026-10-01', amount: 300, split }];
  const { applied, patches } = settleAmountPatches(items, 'Rahul', 100);
  assert.equal(applied, 100);
  const next = [{ ...items[0], split: patches[0].split }];
  assert.equal(friendBalances(next).find(b => b.name === 'Rahul').net, -200);
  const rest = settleAmountPatches(next, 'Rahul', 200);
  const done = [{ ...items[0], split: rest.patches[0].split }];
  assert.equal(friendBalances(done).find(b => b.name === 'Rahul').net, 0);
});

test('groups: names (newest first), one group\'s splits, totals; reminder text', () => {
  const draft2 = (o) => ({ ...emptyDraft(), ...o });
  const goa = buildSplit(1000, draft2({ friends: ['Rahul'], group: 'Goa' })).split;
  const flat = buildSplit(2000, draft2({ friends: ['Rahul', 'Priya'], group: 'Flat', paidBy: 'Priya' })).split;
  const plain = buildSplit(400, draft2({ friends: ['Rahul'] })).split;
  const items = [
    { id: '1', type: 'expense', title: 'Hotel', date: '2026-10-01', amount: 500, split: goa },
    { id: '2', type: 'expense', title: 'Rent', date: '2026-10-05', amount: 667, split: flat },
    { id: '3', type: 'expense', title: 'Chai', date: '2026-10-06', amount: 200, split: plain },
  ];
  assert.deepEqual(groupNames(items), ['Flat', 'Goa']);
  assert.deepEqual(inGroup(items, 'goa').map(i => i.id), ['1']);
  assert.deepEqual(inGroup(items, '').map(i => i.id), ['3']);
  const t = groupTotals(items);
  assert.deepEqual(t.map(g => [g.name, g.net]), [['Flat', -666.67], ['Goa', 500]]);
  const rahul = friendBalances(items).find(b => b.name === 'Rahul');
  const msg = reminderText(rahul);
  assert.ok(msg.startsWith('Hi Rahul, a quick reminder: you owe me ₹700.'), msg);
  assert.ok(msg.includes('• Hotel: ₹500') && msg.includes('• Chai: ₹200') && msg.endsWith('Thanks!'));
  const owesMe = friendBalances(items).find(b => b.name === 'Priya');
  assert.equal(reminderText(owesMe), '', 'nothing to remind when you owe them');
});

test('a group remembers its friends, who paid and how it is split (not the old amounts)', () => {
  const { groupDefaultDraft } = mod.exports;
  const draft2 = (o) => ({ ...emptyDraft(), ...o });
  const s1 = buildSplit(1000, draft2({ friends: ['Rahul'], group: 'Goa', method: 'shares', shares: { you: '2', Rahul: '1' } })).split;
  const s2 = buildSplit(600, draft2({ friends: ['Rahul', 'Priya'], group: 'Goa', paidBy: 'Priya', method: 'exact', exact: { you: '100', Rahul: '200', Priya: '300' } })).split;
  const items = [
    { id: '1', type: 'expense', title: 'Hotel', date: '2026-10-01', amount: 500, split: s1 },
    { id: '2', type: 'expense', title: 'Dinner', date: '2026-10-02', amount: 100, split: s2 },
  ];
  const d = groupDefaultDraft(items, 'goa');
  assert.deepEqual([d.friends, d.paidBy, d.method, d.group], [['Rahul', 'Priya'], 'Priya', 'equal', 'Goa'], 'fixed amounts become an equal split');
  assert.deepEqual(d.exact, {});
  const d1 = groupDefaultDraft([items[0]], 'Goa');
  assert.deepEqual([d1.method, d1.shares.you, d1.shares.Rahul], ['shares', '2', '1']);
  assert.equal(groupDefaultDraft(items, 'Nope'), null);
});

test('friend history lists open, part-paid and settled splits, newest first', () => {
  const { friendHistory } = mod.exports;
  const d = (o) => ({ ...emptyDraft(), ...o });
  const a = buildSplit(1000, d({ friends: ['Rahul'] })).split;                       // you paid, Rahul owes 500
  const b = buildSplit(400, d({ friends: ['Rahul'] })).split;                        // you paid, Rahul owes 200
  const c = buildSplit(600, d({ friends: ['Rahul'], paidBy: 'Rahul' })).split;       // Rahul paid, you owe 300
  const items = [
    { id: '1', type: 'expense', title: 'Hotel', date: '2026-10-01', amount: 500, split: { ...a, people: [{ ...a.people[0], settled: true }] } },
    { id: '2', type: 'expense', title: 'Chai', date: '2026-10-05', amount: 200, split: { ...b, people: [{ ...b.people[0], paid: 50 }] } },
    { id: '3', type: 'expense', title: 'Dinner', date: '2026-10-03', amount: 300, split: { ...c, youSettled: true } },
    { id: '4', type: 'expense', title: 'Other friend', date: '2026-10-04', amount: 100, split: buildSplit(200, d({ friends: ['Priya'] })).split },
  ];
  const h = friendHistory(items, 'rahul');
  assert.deepEqual(h.map(e => [e.id, e.status, e.amount, e.paid]), [['2', 'part', 200, 50], ['3', 'settled', -300, 300], ['1', 'settled', 500, 500]]);
  assert.equal(friendHistory(items, 'Nobody').length, 0);
});
