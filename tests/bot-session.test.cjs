const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../lib/botSession.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { freshSession, SESSION_TTL_MS } = mod.exports;

const now = Date.parse('2026-10-13T10:00:00Z');
const at = ms => new Date(now - ms).toISOString();

test('bot memory: recent session kept, old or undated session dropped', () => {
  const recent = { updatedAt: at(5 * 60 * 1000), lastBotMessage: 'x' };
  assert.equal(freshSession(recent, now), recent);
  assert.equal(freshSession({ updatedAt: at(SESSION_TTL_MS + 1000), lastBotMessage: 'x' }, now), null);
  assert.equal(freshSession({ lastBotMessage: 'x' }, now), null);
  assert.equal(freshSession(null, now), null);
});
