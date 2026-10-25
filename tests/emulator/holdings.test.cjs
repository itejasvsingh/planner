// Investment holdings: checks and storage. `npm run test:emulator`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
const jiti = require('jiti')(__filename);
const { cleanHolding, listHoldings, saveHolding, removeHolding, MAX_HOLDINGS } = jiti(path.join(__dirname, '../../lib/holdings.ts'));
const { exportAccount, deleteAccount } = jiti(path.join(__dirname, '../../lib/accountData.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));

const P = '919876500901';
const ok = (x) => { const r = cleanHolding(x); assert.equal(r.ok, true, JSON.stringify(r)); return r.holding; };
const bad = (x) => { const r = cleanHolding(x); assert.equal(r.ok, false); return r.error; };

test('what is accepted: a type, a name, and something that says what it is worth', () => {
  assert.deepEqual(ok({ type: 'mf', name: ' HDFC  Flexi Cap ', invested: 20000, units: 12.5, schemeCode: '118955' }),
    { owner: 'me', type: 'mf', name: 'HDFC Flexi Cap', invested: 20000, units: 12.5, price: null, value: null, schemeCode: '118955', rate: null, maturity: null });
  assert.equal(ok({ type: 'stock', name: 'Infosys', units: 10, price: 1400 }).invested, 0, 'no invested amount: stored as 0, no gain shown');
  assert.equal(ok({ type: 'fd', name: 'SBI FD', owner: 'Mom', invested: 100000, value: 108000, rate: 7.1, maturity: '2027-03-05' }).owner, 'Mom');
  assert.match(bad({ type: 'bonds', name: 'x', value: 1 }), /type/i);
  assert.match(bad({ type: 'fd', name: '', value: 1 }), /name/i);
  assert.match(bad({ type: 'fd', name: 'FD' }), /value/i, 'nothing says what it is worth');
  assert.match(bad({ type: 'mf', name: 'Fund', units: 5 }), /pick the fund|current value/i, 'units without a fund or a price');
  assert.match(bad({ type: 'fd', name: 'FD', value: -5 }), /numbers/i);
  assert.match(bad({ type: 'fd', name: 'FD', value: 'abc' }), /numbers/i);
  assert.match(bad({ type: 'fd', name: 'FD', value: 5, owner: 'Mom/../x' }), /name/i);
  assert.match(bad({ type: 'mf', name: 'F', value: 5, schemeCode: 'abc' }), /code/i);
  assert.match(bad({ type: 'fd', name: 'FD', value: 5, rate: 500 }), /percent/i);
  assert.match(bad({ type: 'fd', name: 'FD', value: 5, maturity: '5 March' }), /date/i);
});

test('add, edit and remove; each person has their own list', async () => {
  const id = await saveHolding(P, ok({ type: 'stock', name: 'Infosys', units: 10, price: 1400, invested: 15000 }));
  const id2 = await saveHolding(P, ok({ type: 'gold', name: 'Gold', owner: 'Dad', units: 20, price: 7500 }));
  assert.deepEqual((await listHoldings(P)).map(h => h.name), ['Infosys', 'Gold']);
  await saveHolding(P, ok({ type: 'stock', name: 'Infosys', units: 10, price: 1500, invested: 15000 }), id);
  const edited = (await listHoldings(P)).find(h => h.id === id);
  assert.equal(edited.price, 1500);
  await assert.rejects(saveHolding(P, ok({ type: 'stock', name: 'X', value: 1 }), 'no-such-id'), /gone/);
  await removeHolding(P, id2);
  assert.deepEqual((await listHoldings(P)).map(h => h.name), ['Infosys']);
  assert.deepEqual(await listHoldings('919876500902'), [], 'another person has none');
  assert.ok(MAX_HOLDINGS >= 100);
});

test('holdings travel with "Download my data" and go with "Delete my account"', async () => {
  const data = await exportAccount(P);
  assert.equal(data.money.holdings.some(h => h.name === 'Infosys'), true);
  await deleteAccount(P, `wa_${P}`);
  assert.deepEqual(await listHoldings(P), []);
  assert.equal((await db.collection('money_accounts').doc(P).collection('holdings').get()).size, 0);
});
