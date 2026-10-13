const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../lib/taskMatch.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { sameTask } = mod.exports;
const t = (title, dueDate = '2026-10-15') => ({ title, dueDate });

test('the same announcement sent twice is the same task, however it is worded', () => {
  assert.equal(sameTask(t('Lecture: Product Strategy in Technology M&A'), t('Lecture: Product Strategy in Technology M&A (CLT Hall)')), true);
  assert.equal(sameTask(t('ICRC Lecture: Product Strategy in Technology M&A'), t('Lecture: Product Strategy in Technology M&A (CLT Hall)')), true);
});

test('different tasks, or the same words on another day, stay separate', () => {
  assert.equal(sameTask(t('Call John'), t('Call mom')), false);
  assert.equal(sameTask(t('Buy milk'), t('Buy bread')), false);
  assert.equal(sameTask(t('Lecture: Product Strategy'), t('Lecture: Product Strategy', '2026-10-16')), false);
});
