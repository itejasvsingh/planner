const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Only the two pure functions are loaded; the network code stays out of the unit test
const src = fs.readFileSync(path.join(__dirname, '../lib/ai.ts'), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/export async function callAnthropic[\s\S]*$/, '');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { providerOrder, extractJson } = mod.exports;

test('provider order: chosen one first, the other only if it has a key', () => {
  assert.deepEqual(providerOrder({ GEMINI_API_KEY: 'g' }), ['gemini']);
  assert.deepEqual(providerOrder({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }), ['anthropic', 'gemini']);
  assert.deepEqual(providerOrder({ AI_PROVIDER: 'anthropic', GEMINI_API_KEY: 'g' }), ['gemini'], 'no Anthropic key: Gemini still works');
  assert.deepEqual(providerOrder({ AI_PROVIDER: 'Anthropic', ANTHROPIC_API_KEY: 'a' }), ['anthropic']);
  assert.deepEqual(providerOrder({}), []);
});

test('extractJson finds the object in a fenced or chatty reply, and gives up on junk', () => {
  assert.deepEqual(extractJson('{"items":[{"title":"x"}]}'), { items: [{ title: 'x' }] });
  assert.deepEqual(extractJson('Here you go:\n```json\n{"items":[]}\n```'), { items: [] });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{broken'), null);
});
