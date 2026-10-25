const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/portfolio.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { valueHolding, summarize, wholeNetWorth } = mod.exports;

const navs = { '118955': { nav: 2000, date: '23-Oct-2026' } };
const H = [
  { id: 'a', owner: 'me', type: 'mf', name: 'HDFC Flexi Cap', invested: 20000, units: 12.5, schemeCode: '118955' },          // 25,000 live
  { id: 'b', owner: 'me', type: 'stock', name: 'Infosys', invested: 15000, units: 10, price: 1400 },                              // 14,000
  { id: 'c', owner: 'Mom', type: 'fd', name: 'SBI FD', invested: 100000, value: 108000, rate: 7.1, maturity: '2027-03-05' },       // 108,000
  { id: 'd', owner: 'Dad', type: 'gold', name: 'Gold coins', invested: 0, units: 20, price: 7500 },                                // 150,000, no cost
  { id: 'e', owner: 'me', type: 'mf', name: 'Old fund (no price found)', invested: 5000, units: 10, schemeCode: '999999' },        // no NAV, no value -> 0
];

test('a holding is valued by live NAV, then a typed price, then a typed value', () => {
  assert.deepEqual([H[0], H[1], H[2], H[3]].map(h => valueHolding(h, navs).source), ['nav', 'price', 'manual', 'price']);
  const mf = valueHolding(H[0], navs);
  assert.deepEqual([mf.current, mf.gain, mf.gainPct, mf.navDate], [25000, 5000, 25, '23-Oct-2026']);
  assert.deepEqual([valueHolding(H[1], navs).current, valueHolding(H[1], navs).gain], [14000, -1000]);
  assert.equal(valueHolding(H[3], navs).gain, null, 'no invested amount: no gain shown');
  assert.equal(valueHolding(H[4], navs).current, 0, 'a fund whose price is not found counts 0 until fixed');
  // no live price yet (offline) but a typed value still works
  assert.equal(valueHolding({ ...H[0], value: 24000 }, {}).current, 24000);
});

test('totals, gain only over holdings with a cost, by type and by owner, and filtered to one person', () => {
  const all = summarize(H, navs);
  assert.deepEqual([all.total, all.invested], [25000 + 14000 + 108000 + 150000, 20000 + 15000 + 100000 + 5000]);
  // gain only counts a, b, c, e (they have a cost): (25000+14000+108000+0) - 140000
  assert.deepEqual([all.gain, all.gainPct], [7000, 5]);
  assert.deepEqual(all.byType.map(t => [t.type, t.total, t.count]), [['mf', 25000, 2], ['stock', 14000, 1], ['fd', 108000, 1], ['gold', 150000, 1]]);
  assert.equal(all.byType.reduce((t, x) => t + x.pct, 0) > 99.9, true);
  assert.deepEqual(all.byOwner.map(o => [o.owner, o.total]), [['me', 39000], ['Dad', 150000], ['Mom', 108000]], 'you first, then by size');
  const mom = summarize(H, navs, 'Mom');
  assert.deepEqual([mom.total, mom.holdings.length], [108000, 1]);
  assert.deepEqual(summarize(H, navs, 'me').holdings.map(h => h.id), ['a', 'b', 'e']);
  assert.equal(summarize([], navs).gainPct, null);
});

test('whole net worth: banks + investments (+ family) + other assets, less card dues and loans', () => {
  const parts = { banks: 80000, owedOnCards: 9000, otherAssets: 500000, liabilities: 200000, mine: 39000, family: 258000 };
  const mine = wholeNetWorth(parts, false);
  assert.equal(mine.net, 80000 + 39000 + 500000 - 9000 - 200000);
  assert.equal(mine.lines.some(l => l.key === 'family'), false);
  const withFamily = wholeNetWorth(parts, true);
  assert.equal(withFamily.net, mine.net + 258000);
  assert.deepEqual(withFamily.lines.map(l => l.key), ['banks', 'mine', 'family', 'other', 'cards', 'liab']);
  assert.deepEqual(wholeNetWorth({ banks: 0, owedOnCards: 0, otherAssets: 0, liabilities: 0, mine: 0, family: 0 }, true).lines.map(l => l.key), ['banks', 'mine']);
});
