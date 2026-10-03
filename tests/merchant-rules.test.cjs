const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', out)(mod, mod.exports);
  return mod.exports;
}
const server = load('lib/merchantKey.ts').merchantKey;
const app = load('align-native/src/lib/merchant-key.ts').merchantKey;

test('one merchant, however the bank or you spell it', () => {
  for (const k of [server, app]) {
    assert.equal(k('ISTHARA PARKS PRIVATE LIMITED'), 'isthara parks');
    assert.equal(k('Isthara Parks'), 'isthara parks');
    assert.equal(k('isthara  parks pvt ltd'), 'isthara parks');
    assert.equal(k('Dunkin & Co'), 'dunkin and');
    assert.equal(k('Swiggy'), 'swiggy');
    assert.equal(k(''), '');
    assert.equal(k(null), '');
  }
});

test('the app and the server compute the same key', () => {
  for (const name of ['ISTHARA PARKS PRIVATE LIMITED', 'Uber India Systems', 'AMAZON PAY IN', 'Rahul Kumar Sharma', 'Café Coffee Day', '99acres', 'H&M']) {
    assert.equal(app(name), server(name), name);
  }
});
