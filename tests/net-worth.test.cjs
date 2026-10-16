const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/net-worth.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { netWorth, validEntries } = mod.exports;

test('net worth: ticked bank balances and custom assets, less card dues and custom liabilities', () => {
  const r = netWorth(
    [{ balance: 50000 }, { balance: 12000, excluded: true }],
    [{ outstanding: 5700 }, { outstanding: 999, hidden: true }],
    [
      { id: 'a', name: 'Flat', kind: 'asset', value: 2500000 },
      { id: 'b', name: 'Loan from Rahul', kind: 'liability', value: 20000 },
    ],
  );
  assert.deepEqual([r.bank, r.owedOnCards, r.assets, r.liabilities, r.net], [50000, 5700, 2550000, 25700, 2524300]);
  assert.equal(r.customAssets.length, 1);
});

test('net worth: negative when you owe more; bad or missing entries are ignored', () => {
  assert.equal(netWorth([{ balance: 100 }], [{ outstanding: 500 }], undefined).net, -400);
  const messy = [{ id: 'x' }, { id: 'y', name: 'No kind', value: 5 }, { id: 'z', name: 'Neg', kind: 'asset', value: -5 }, null, { id: 'ok', name: 'Gold', kind: 'asset', value: 10 }];
  assert.deepEqual(validEntries(messy).map(e => e.id), ['ok']);
  assert.equal(netWorth([], [], 'garbage').net, 0);
});
