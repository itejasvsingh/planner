const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/outbox-core.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { enqueue, overlay, drain, withTimeout, SERVER_TIMESTAMP } = mod.exports;

const C = 'planner_items';
const set = (id, data, at = 1) => ({ kind: 'set', col: C, id, data, at });
const upd = (id, patch, at = 2) => ({ kind: 'update', col: C, id, patch, at });
const del = (id, at = 3) => ({ kind: 'delete', col: C, id, at });

test('edits to a pending create fold into the create', () => {
  let q = enqueue([], set('a', { title: 'Milk', done: false }));
  q = enqueue(q, upd('a', { done: true }));
  q = enqueue(q, upd('a', { title: 'Oat milk' }));
  assert.equal(q.length, 1);
  assert.deepEqual(q[0].data, { title: 'Oat milk', done: true });
});

test('updates to a synced doc merge; a delete replaces everything pending for that doc', () => {
  let q = enqueue([], upd('b', { done: true }));
  q = enqueue(q, upd('b', { priority: 'high' }));
  assert.equal(q.length, 1);
  assert.deepEqual(q[0].patch, { done: true, priority: 'high' });
  q = enqueue(q, set('c', { title: 'x' }));
  q = enqueue(q, del('b'));
  assert.deepEqual(q.map(o => [o.kind, o.id]), [['set', 'c'], ['delete', 'b']]);
});

test('merge-sets (settings docs) are kept in order, not folded', () => {
  const s1 = { kind: 'set', col: 'planner_settings', id: 'p', data: { a: 1 }, merge: true, at: 1 };
  const s2 = { kind: 'set', col: 'planner_settings', id: 'p', data: { b: 2 }, merge: true, at: 2 };
  assert.equal(enqueue(enqueue([], s1), s2).length, 2);
});

test('overlay applies pending creates, edits and deletes on top of server data', () => {
  const server = [{ id: 'b', title: 'Bills', done: false }, { id: 'd', title: 'Dentist' }];
  const q = [set('a', { title: 'Milk', createdAt: SERVER_TIMESTAMP }), upd('b', { done: true }), del('d'), { kind: 'update', col: 'other', id: 'b', patch: { x: 1 }, at: 1 }];
  const view = overlay(server, q, C);
  assert.deepEqual(view, [{ title: 'Milk', id: 'a' }, { id: 'b', title: 'Bills', done: true }]);
  // applying twice gives the same result (safe to re-run on already-overlaid data)
  assert.deepEqual(overlay(view, q, C), view);
});

test('drain sends in order and stops at the first op that must wait', async () => {
  const q = [set('a', {}), upd('b', { done: true }), del('c')];
  const seen = [];
  const res = await drain(q, async op => { seen.push(op.id); return op.id === 'b' ? 'retry' : 'ok'; });
  assert.deepEqual(seen, ['a', 'b']);
  assert.deepEqual(res.sent.map(o => o.id), ['a']);
  assert.deepEqual(res.remaining.map(o => o.id), ['b', 'c']);
});

test('drain drops permanently rejected ops and treats thrown errors as retry', async () => {
  const q = [set('a', {}), set('b', {}), set('c', {})];
  const res = await drain(q, async op => { if (op.id === 'a') return 'drop'; if (op.id === 'b') throw new Error('net'); return 'ok'; });
  assert.deepEqual(res.dropped.map(o => o.id), ['a']);
  assert.deepEqual(res.remaining.map(o => o.id), ['b', 'c']);
});

test('withTimeout returns the fallback for a promise that never settles', async () => {
  assert.equal(await withTimeout(new Promise(() => {}), 20, 'retry'), 'retry');
  assert.equal(await withTimeout(Promise.resolve('ok'), 20, 'retry'), 'ok');
  assert.equal(await withTimeout(Promise.reject(new Error('x')), 20, 'retry'), 'retry');
});
