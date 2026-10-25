const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/buy.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { looksLikeBuy, parseBuyText, matchPurchase, nearbyBuys, dueBuys, shareText, openBuys } = mod.exports;

test('buy phrases are recognised and priced', () => {
  assert.equal(looksLikeBuy('remember to buy batteries'), true);
  assert.equal(looksLikeBuy('buy'), false);
  assert.equal(looksLikeBuy('lunch 250'), false);
  assert.deepEqual(parseBuyText('buy headphones 2000'), { title: 'Headphones', price: 2000 });
  assert.deepEqual(parseBuyText('Pick up a charger ₹1,299'), { title: 'Charger', price: 1299 });
  assert.deepEqual(parseBuyText("don't forget to buy milk"), { title: 'Milk', price: null });
});

test('a later spend ticks the item off by shop, name or price', () => {
  const item = { id: 'b1', type: 'buy', title: 'Headphones', price: 2000, shop: 'Amazon', createdDate: '2026-10-20' };
  assert.equal(matchPurchase(item, [{ id: 't1', type: 'expense', title: 'Amazon Pay', amount: 999, date: '2026-10-22' }]).id, 't1');
  assert.equal(matchPurchase({ ...item, shop: null }, [{ id: 't2', type: 'expense', title: 'Croma', amount: 1980, date: '2026-10-22' }]).id, 't2');
  assert.equal(matchPurchase({ ...item, shop: null, price: null }, [{ id: 't3', type: 'expense', title: 'Boat Headphones Store', amount: 1500, date: '2026-10-22' }]).id, 't3');
  assert.equal(matchPurchase(item, [{ id: 't4', type: 'expense', title: 'Amazon', amount: 100, date: '2026-10-10' }]), null, 'before it was added');
  assert.equal(matchPurchase(item, [{ id: 't5', type: 'expense', title: 'Swiggy', amount: 450, date: '2026-10-22' }]), null);
});

test('nearby, due and share', () => {
  const items = [
    { id: 'a', type: 'buy', title: 'Medicine', place: { lat: 12.9716, lng: 77.5946 }, remindOn: '2026-10-25' },
    { id: 'b', type: 'buy', title: 'Shoes', place: { lat: 13.1, lng: 77.9 }, price: 3500, shop: 'Decathlon' },
    { id: 'c', type: 'buy', title: 'Done', done: true },
  ];
  assert.deepEqual(nearbyBuys(items, { lat: 12.9718, lng: 77.5948 }).map(i => i.id), ['a']);
  assert.deepEqual(dueBuys(items, '2026-10-26').map(i => i.id), ['a']);
  assert.equal(openBuys(items).length, 2);
  assert.equal(shareText(items), 'Things to buy:\n• Medicine\n• Shoes (₹3,500) at Decathlon');
});

test('the WhatsApp copy reads text the same way', () => {
  const t = fs.readFileSync(path.join(__dirname, '../lib/buyText.ts'), 'utf8');
  const o = ts.transpileModule(t, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', o)(m, m.exports);
  for (const s of ['buy headphones 2000', 'remember to buy batteries', 'Pick up a charger ₹1,299', 'lunch 250', 'buy', "don't forget to buy milk", 'I need to get some bread 40']) {
    assert.equal(m.exports.looksLikeBuy(s), looksLikeBuy(s), s);
    if (looksLikeBuy(s)) assert.deepEqual(m.exports.parseBuyText(s), parseBuyText(s), s);
  }
});

test('plain "get" and "order" are not buy lists (they are tasks and spends)', () => {
  assert.equal(looksLikeBuy('order swiggy 450'), false);
  assert.equal(looksLikeBuy('get a haircut'), false);
  assert.equal(looksLikeBuy('remember to order cake'), true);
  assert.equal(looksLikeBuy('pick up charger'), true);
});
