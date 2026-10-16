const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/card-format.ts'), 'utf8').replace(/^import .*$/gm, '');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { nextStatement, cardNumbers } = mod.exports;

test('next statement is about a month after the last, clamped to short months', () => {
  assert.equal(nextStatement('2026-10-10'), '10 Nov');
  assert.equal(nextStatement('2026-01-31'), '28 Feb');
  assert.equal(nextStatement('2026-12-15'), '15 Jan');
  assert.equal(nextStatement(null), null);
  assert.equal(nextStatement('garbage'), null);
});

test('card numbers: billed is what is left of the statement; limit and left only with a limit', () => {
  assert.deepEqual(cardNumbers({ outstanding: 5000, spentSince: 1200, limit: 100000 }), { limit: 100000, billed: 3800, unbilled: 1200, outstanding: 5000, left: 95000 });
  assert.deepEqual(cardNumbers({ outstanding: 0, spentSince: 0, limit: null }), { limit: null, billed: 0, unbilled: 0, outstanding: 0, left: null });
  assert.equal(cardNumbers({ outstanding: 200000, spentSince: 0, limit: 150000 }).left, 0, 'never negative');
});
