const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/statement-match.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { idSeeds, planRows } = mod.exports;

const P = '910000000001';
const row = (o) => ({ date: '2026-09-05', description: 'UPI-ZOMATO', merchant: 'Zomato', category: 'Food & Dining', amount: 250, type: 'expense', ref: null, ...o });
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

test('rows with a UPI ref get the same document id as SMS auto-import', () => {
  const [seed] = idSeeds(P, [row({ ref: '427512345678' })]);
  // app/api/ingest/sms/route.ts: doc(`auto_${sha256(`${phone}_${dedupKey}`).slice(0, 28)}`), dedupKey = `ref_${ref}`
  assert.equal(seed, `${P}_ref_427512345678`);
  assert.equal(`auto_${sha(seed).slice(0, 28)}`, `auto_${sha(`${P}_ref_427512345678`).slice(0, 28)}`);
});

test('identical rows without a ref get distinct, repeatable ids; a repeated ref falls back to the row key', () => {
  const rows = [row({}), row({}), row({ ref: '1' }), row({ ref: '1', type: 'income' })];
  const a = idSeeds(P, rows);
  assert.equal(new Set(a).size, 4);
  assert.deepEqual(idSeeds(P, rows), a);
  assert.match(a[3], /_stmt_/);
});

test('planRows: exact id = already imported; same amount within 3 days = likely; otherwise new', () => {
  const rows = [row({ date: '2026-09-05' }), row({ date: '2026-09-06', amount: 1499, merchant: 'Uber' }), row({ date: '2026-09-07', amount: 85000, type: 'income' }), row({ date: '2026-09-20', amount: 99 })];
  const ids = ['stmt_a', 'stmt_b', 'stmt_c', 'stmt_d'];
  const items = [
    { id: 'stmt_a', type: 'expense', amount: 250, date: '2026-09-05' },
    { id: 'manual1', type: 'expense', amount: '1499', date: '2026-09-04' },
    { id: 'manual2', type: 'expense', amount: 85000, date: '2026-09-07' }, // wrong direction: not a match
    { id: 'task', type: 'task', dueDate: '2026-09-20' },
    { id: 'old99', type: 'expense', amount: 99, date: '2026-09-10' }, // too far apart
  ];
  const plan = planRows(rows, ids, items);
  assert.deepEqual(plan.map(p => p.status), ['imported', 'likely', 'new', 'new']);
  assert.equal(plan[1].matchId, 'manual1');
});

test('each existing transaction matches at most one statement row', () => {
  const rows = [row({ date: '2026-09-05' }), row({ date: '2026-09-05', description: 'UPI-ZOMATO 2' })];
  const plan = planRows(rows, ['x1', 'x2'], [{ id: 'm', type: 'expense', amount: 250, date: '2026-09-05' }]);
  assert.deepEqual(plan.map(p => p.status), ['likely', 'new']);
});

test('rows you deleted in Align are not offered again', () => {
  const rows = [row({ date: '2026-09-05' }), row({ date: '2026-09-06', amount: 99 })];
  const plan = planRows(rows, ['auto_x', 'stmt_y'], [], ['auto_x']);
  assert.deepEqual(plan.map(p => p.status), ['deleted', 'new']);
});
