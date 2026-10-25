const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../lib/amfi.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { parseNavAll, searchSchemes, loadSchemes, navsFor, resetAmfiCache } = mod.exports;

// A few lines in AMFI's real format (made-up funds and prices)
const SAMPLE = [
  'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date', ' ',
  'Open Ended Schemes(Equity Scheme - Flexi Cap Fund)', ' ', 'Example Mutual Fund', ' ',
  '100001;INF000A00001;-;Example Flexi Cap Fund;Direct Plan;Growth Option;2121.91;23-Oct-2026',
  '100002;INF000A00002;-;Example Flexi Cap Fund;Direct Plan;IDCW Option;45.10;23-Oct-2026',
  '100003;INF000A00003;-;Example Flexi Cap Fund;Regular Plan;Growth Option;1888.5;23-Oct-2026',
  '100004;INF000A00004;-;Example Liquid Fund;Direct Plan;Growth Option;N.A.;23-Oct-2026',
  '100005;INF000A00005;-;Other Bluechip Fund - Direct Plan;Direct Plan;Growth Option;98.7;22-Oct-2026',
  'garbage line without enough fields',
].join('\n');

test('the price list is read: real schemes only, no headers, no "N.A." prices', () => {
  const list = parseNavAll(SAMPLE);
  assert.deepEqual(list.map(s => s.code), ['100001', '100002', '100003', '100005']);
  assert.deepEqual(list[0], { code: '100001', name: 'Example Flexi Cap Fund', plan: 'Direct Plan', option: 'Growth Option', nav: 2121.91, date: '23-Oct-2026' });
});

test('searching by words: every word must match, Growth plans first', () => {
  const list = parseNavAll(SAMPLE);
  assert.deepEqual(searchSchemes(list, 'flexi cap').map(s => s.code), ['100001', '100003', '100002']);
  assert.deepEqual(searchSchemes(list, 'example direct').map(s => s.code), ['100001', '100002']);
  assert.deepEqual(searchSchemes(list, 'bluechip').map(s => s.code), ['100005']);
  assert.deepEqual(searchSchemes(list, ''), []);
  assert.deepEqual(searchSchemes(list, 'nothing like this'), []);
});

test('loading: cached for six hours, a failed refresh keeps the last good list, and prices are looked up by code', async () => {
  resetAmfiCache();
  // A list that is too short is refused (a broken download must not wipe the real one)
  const big = Array.from({ length: 1100 }, (_, i) => `${200000 + i};INF;-;Fund ${i};Direct Plan;Growth Option;${10 + i};23-Oct-2026`).join('\n');
  let calls = 0;
  const ok = async () => { calls++; return new Response(big, { status: 200 }); };
  const t0 = 1_000_000;
  const all = await loadSchemes(t0, ok);
  assert.equal(all.size, 1100);
  await loadSchemes(t0 + 60_000, ok);
  assert.equal(calls, 1, 'second call within six hours uses the cache');
  const down = async () => { throw new Error('offline'); };
  assert.equal((await loadSchemes(t0 + 7 * 3600_000, down)).size, 1100, 'AMFI unreachable: the last good list stays');
  assert.deepEqual(await navsFor(['200003', '999999', '200003', ''], t0 + 7 * 3600_000, down), { '200003': { nav: 13, date: '23-Oct-2026' } }, 'unknown codes are left out');
  assert.deepEqual(await navsFor([], t0, down), {});
  resetAmfiCache();
  assert.equal((await loadSchemes(t0, async () => new Response('Scheme Code;x', { status: 200 }))).size, 0, 'a broken download with nothing cached gives an empty list, not a crash');
});
