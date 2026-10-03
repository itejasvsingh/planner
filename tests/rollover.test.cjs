const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const load = (file, req = () => ({})) => {
  const out = ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
  return mod.exports;
};
const { overdueTasks } = load('../align-native/src/lib/task-rollover.ts');
const { hasCronSecret } = load('../lib/cronAuth.ts', require);

test('every undone task from an earlier day moves; done, future, card bills and non-tasks stay', () => {
  const items = [
    { id: 'a', type: 'task', done: false, dueDate: '2026-09-28' },
    { id: 'b', type: 'task', done: false, dueDate: '2026-10-02' },
    { id: 'c', type: 'task', done: true, dueDate: '2026-10-01' },
    { id: 'd', type: 'task', done: false, dueDate: '2026-10-03' },
    { id: 'e', type: 'task', done: false, dueDate: '2026-10-09' },
    { id: 'f', type: 'task', done: false, dueDate: '2026-10-01', kind: 'card_bill' },
    { id: 'g', type: 'expense', date: '2026-10-01' },
    { id: 'h', type: 'task', done: false, date: '2026-09-30' },
  ];
  assert.deepEqual(overdueTasks(items, '2026-10-03'), [{ id: 'a', from: '2026-09-28' }, { id: 'b', from: '2026-10-02' }, { id: 'h', from: '2026-09-30' }]);
});

test('cron requests: Vercel\'s Bearer header works, wrong or missing secrets do not', () => {
  const req = (headers = {}, q = '') => new Request(`https://x.test/api/cron/auto-push${q}`, { headers });
  assert.equal(hasCronSecret(req({ authorization: 'Bearer s3cret' }), 's3cret'), true);
  assert.equal(hasCronSecret(req({ 'x-vercel-cron-secret': 's3cret' }), 's3cret'), true);
  assert.equal(hasCronSecret(req({}, '?secret=s3cret'), 's3cret'), true);
  assert.equal(hasCronSecret(req({ authorization: 'Bearer nope' }), 's3cret'), false);
  assert.equal(hasCronSecret(req({}), 's3cret'), false);
  assert.equal(hasCronSecret(req({ authorization: 'Bearer ' }), ''), false, 'unset secret never matches');
  assert.equal(hasCronSecret(req({}), undefined), false);
});
