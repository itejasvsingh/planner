const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

// Exercise the real hook's write paths against an isolated Firestore boundary.
// No credentials, network requests, or production records are used.
function setup({ reject = false, phone = 'test-owner' } = {}) {
  const writes = [];
  const states = [];
  const cache = new Map();
  const firestore = {
    collection: (_, name) => name,
    doc: (_, name, id) => { assert.ok(id); return { name, id }; },
    serverTimestamp: () => 'server-timestamp',
    addDoc: async (collection, data) => {
      function check(value) {
        assert.notEqual(value, undefined, 'Firestore rejects undefined fields');
        if (value && typeof value === 'object') Object.values(value).forEach(check);
      }
      check(data);
      if (reject) throw new Error('permission-denied');
      writes.push({ collection, data });
      return { id: `saved-${writes.length}` };
    },
  };
  const react = {
    useState: initial => {
      const index = states.length;
      states.push(initial);
      return [initial, value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useCallback: fn => fn,
    useEffect: () => {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/use-planner-items.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, console, setTimeout, clearTimeout,
    require: name => {
      if (name === 'react') return react;
      if (name === 'firebase/firestore') return firestore;
      if (name.endsWith('/firebase')) return { db: {} };
      if (name.endsWith('/storage')) return { itemsCacheKey: p => p, setItem: async (key, val) => cache.set(key, val) };
      if (name.endsWith('/haptics')) return { triggerHaptic() {} };
      if (name.endsWith('/phone')) return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { hook: exports.usePlannerItems(phone), writes, states, cache };
}

test('manual task is saved without a client id or undefined values', async () => {
  const { hook, writes, states } = setup();
  await hook.addTask({ title: 'Read', dueDate: '2026-09-14', reminderTime: null });
  assert.equal(writes[0].collection, 'planner_items');
  assert.equal(writes[0].data.ownerId, 'test-owner');
  assert.equal(writes[0].data.type, 'task');
  assert.equal(writes[0].data.id, undefined);
  assert.equal(states[0][0].id, 'saved-1');
});

test('optional recurring expense fields are omitted', async () => {
  const { hook, writes } = setup();
  await hook.addExpense({ title: 'Coffee', amount: 100, date: '2026-09-14', category: '#Dining' });
  assert.equal(writes[0].data.amount, 100);
  assert.equal('isRecurring' in writes[0].data, false);
  assert.equal('recurringFrequency' in writes[0].data, false);
});

test('new goals use the create path and preserve decimal targets', async () => {
  const { hook, writes } = setup();
  await hook.addGoal({ title: 'Run', target: 12.5, unit: 'km', date: '2026-10-01' });
  assert.equal(writes[0].data.type, 'goal');
  assert.equal(writes[0].data.current, 0);
  assert.equal(writes[0].data.target, 12.5);
});

test('rejected writes remain retryable and remove the unsaved optimistic item', async () => {
  const { hook, states, cache } = setup({ reject: true });
  await assert.rejects(hook.addTask({ title: 'Retry me', dueDate: '2026-09-14', reminderTime: null }), /permission-denied/);
  assert.equal(states[0].length, 0);
  assert.equal(cache.get('test-owner'), '[]');
  assert.match(states[2], /Could not save/);
});

test('missing identity fails explicitly instead of pretending to save', async () => {
  const { hook, writes } = setup({ phone: null });
  await assert.rejects(hook.addGoal({ title: 'Read', target: 2, unit: 'books', date: '2026-10-01' }), /sign in/);
  assert.equal(writes.length, 0);
});
