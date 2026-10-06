const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

// Exercise the real hook's write paths with the outbox and Firestore mocked out.
// No credentials, network requests, or production records are used.
function setup({ phone = 'test-owner' } = {}) {
  const ops = [];
  const states = [];
  const cache = new Map();
  let ids = 0;
  const outbox = {
    newDocId: () => `local-${++ids}`,
    useOutbox: () => ({ queue: [], online: true, dropped: 0 }),
    pushOp: async (owner, op) => {
      function check(value) {
        assert.notEqual(value, undefined, 'Firestore rejects undefined fields');
        if (value && typeof value === 'object') Object.values(value).forEach(check);
      }
      // the real outbox drops undefined values before queueing
      const data = op.data && Object.fromEntries(Object.entries(op.data).filter(([, v]) => v !== undefined));
      if (data) check(data);
      ops.push({ owner, ...op, ...(data ? { data } : {}) });
    },
    pushOps: async (owner, list) => { for (const op of list) await outbox.pushOp(owner, op); },
  };
  const react = {
    useState: initial => {
      const index = states.length;
      states.push(initial);
      return [initial, value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useCallback: fn => fn,
    useEffect: () => {},
    useRef: current => ({ current }),
    // the hook reads one shared store; a plain read is enough here
    useSyncExternalStore: (_subscribe, get) => get(),
  };
  const source = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/use-planner-items.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const coreSrc = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/outbox-core.ts'), 'utf8');
  const core = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(coreSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(core, core.exports);
  const exports = {};
  vm.runInNewContext(code, {
    exports, console, setTimeout, clearTimeout,
    require: name => {
      if (name === 'react') return react;
      if (name === 'react-native') return { LayoutAnimation: { configureNext() {}, Presets: {} } };
      if (name === 'firebase/firestore') return {};
      if (name.endsWith('/firebase')) return { db: {} };
      if (name.endsWith('/storage')) return { itemsCacheKey: p => p, getItem: async () => null, setItem: async (key, val) => cache.set(key, val) };
      if (name.endsWith('/haptics')) return { triggerHaptic() {} };
      if (name.endsWith('/phone')) return { getPhoneVariants: p => [p] };
      if (name.endsWith('/recurring')) return { billsToGenerate: () => [] };
      if (name.endsWith('/outbox')) return outbox;
      if (name.endsWith('/outbox-core')) return core.exports;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { hook: exports.usePlannerItems(phone), items: () => exports.usePlannerItems(phone).items, ops, states, cache };
}

test('a new task shows at once and is queued under a device-made id', async () => {
  const { hook, items, ops, cache } = setup();
  await hook.addTask({ title: 'Read', dueDate: '2026-09-14', reminderTime: null });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].kind, 'set');
  assert.equal(ops[0].col, 'planner_items');
  assert.equal(ops[0].id, 'local-1');
  assert.equal(ops[0].data.ownerId, 'test-owner');
  assert.equal(ops[0].data.type, 'task');
  assert.equal(ops[0].data.id, undefined);
  assert.equal(ops[0].data.createdAt, '__server_timestamp__');
  assert.equal(items()[0].id, 'local-1', 'on screen at once');
  // saved to the device shortly after (batched)
  await new Promise(r => setTimeout(r, 450));
  assert.equal(JSON.parse(cache.get('test-owner'))[0].title, 'Read');
});

test('optional recurring expense fields are omitted', async () => {
  const { hook, ops } = setup();
  await hook.addExpense({ title: 'Coffee', amount: 100, date: '2026-09-14', category: '#Dining' });
  assert.equal(ops[0].data.amount, 100);
  assert.equal('isRecurring' in ops[0].data, false);
  assert.equal('recurringFrequency' in ops[0].data, false);
});

test('new goals use the create path and preserve decimal targets', async () => {
  const { hook, ops } = setup();
  await hook.addGoal({ title: 'Run', target: 12.5, unit: 'km', date: '2026-10-01' });
  assert.equal(ops[0].data.type, 'goal');
  assert.equal(ops[0].data.current, 0);
  assert.equal(ops[0].data.target, 12.5);
});

test('edits and deletes are queued against the same doc', async () => {
  const { hook, ops } = setup();
  await hook.toggleDone('abc', false);
  await hook.deleteItem('abc');
  assert.deepEqual(ops.map(o => [o.kind, o.id]), [['update', 'abc'], ['delete', 'abc']]);
  assert.equal(JSON.stringify(ops[0].patch), '{"done":true}');
});

test('deleting an imported transaction leaves a hidden marker so the next sync does not add it back', async () => {
  const { hook, items, ops } = setup();
  await hook.importItems([
    { id: 'auto_1', type: 'expense', title: 'Zomato', amount: 250, date: '2026-10-05', source: 'gmail', autoDetected: true },
    { id: 'manual_1', type: 'expense', title: 'Tea', amount: 20, date: '2026-10-05' },
  ]);
  ops.length = 0;
  await hook.deleteItem('auto_1');
  await hook.deleteItem('manual_1');
  assert.deepEqual(ops.map(o => [o.kind, o.id]), [['update', 'auto_1'], ['delete', 'manual_1']]);
  assert.equal(ops[0].patch.type, 'deleted');
  assert.equal(ops[0].patch.deletedType, 'expense');
  assert.equal(items().length, 0, 'both are gone from the list');
});
