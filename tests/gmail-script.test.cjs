const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/gmail-script.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { gmailScript } = mod.exports;

const DAY = 86400000;
const msg = (id, daysAgo, body) => ({
  getId: () => id,
  getDate: () => new Date(Date.now() - daysAgo * DAY),
  getSubject: () => 'Alert',
  getPlainBody: () => body,
});

/** Runs the generated script in a sandbox with fake Gmail/Properties/UrlFetch services. */
function run({ threads, responses = () => 200, props = new Map() }) {
  const posts = [];
  const triggers = [];
  const queries = [];
  const sandbox = {
    console: { log() {} },
    Date, JSON,
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: name => ({ timeBased: () => ({ everyMinutes: n => ({ create: () => triggers.push({ name, n }) }) }) }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, v),
        deleteProperty: k => props.delete(k),
        getKeys: () => [...props.keys()],
      }),
    },
    GmailApp: { search: (q, start, max) => { queries.push(q); return threads.slice(start, start + max); } },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10) },
    UrlFetchApp: {
      fetch: (url, opts) => {
        const body = JSON.parse(opts.payload);
        posts.push({ url, body });
        const code = responses(body, posts.length);
        return { getResponseCode: () => code, getContentText: () => JSON.stringify({ status: code === 200 ? 'added' : 'error' }) };
      },
    },
  };
  vm.runInNewContext(gmailScript('https://alignplanner.vercel.app/api/ingest/sms?k=KEY'), sandbox);
  return { sandbox, posts, triggers, props, queries };
}

test('setup installs one 15-minute trigger and imports the last 30 days of bank emails', () => {
  const thread = { getMessages: () => [msg('a', 40, 'old'), msg('b', 2, 'Rs.250.00 has been debited'), msg('c', 0, 'Rs 99 spent')] };
  const r = run({ threads: [thread] });
  r.sandbox.setup();
  assert.deepEqual(r.triggers, [{ name: 'importBankEmails', n: 15 }]);
  assert.match(r.queries[0], /^from:\(hdfcbank\.net OR .*\) newer_than:30d/);
  assert.match(r.queries[0], /slice\.bank\.in/); // slice: noreply@slice.bank.in
  assert.deepEqual(r.posts.map(p => p.body.source), ['email', 'email']);
  assert.match(r.posts[0].url, /k=KEY$/);
  assert.ok(r.posts[0].body.date);
  // running again sends nothing new, and later runs only look back 3 days
  r.sandbox.importBankEmails();
  assert.equal(r.posts.length, 2);
  assert.match(r.queries[r.queries.length - 1], /newer_than:3d/);
});

test('a new alert in an already-seen thread is still sent', () => {
  const messages = [msg('a', 1, 'x')];
  const r = run({ threads: [{ getMessages: () => messages }] });
  r.sandbox.importBankEmails();
  messages.push(msg('b', 0, 'y'));
  r.sandbox.importBankEmails();
  assert.deepEqual(r.posts.map(p => p.body.text.split('\n')[1]), ['x', 'y']);
});

test('when Align is busy it stops and picks up the rest next time', () => {
  const thread = { getMessages: () => [msg('a', 1, 'x'), msg('b', 1, 'y'), msg('c', 1, 'z')] };
  let busy = true;
  const r = run({ threads: [thread], responses: (_, n) => (busy && n === 2 ? 429 : 200) });
  r.sandbox.importBankEmails();
  assert.equal(r.props.get('started'), undefined); // first run not finished: keep the 30-day window
  busy = false;
  r.sandbox.importBankEmails();
  assert.deepEqual(r.posts.map(p => p.body.text.split('\n')[1]), ['x', 'y', 'y', 'z']);
  assert.equal(r.props.get('started'), '1');
});

test('a revoked link stops with a clear message', () => {
  const r = run({ threads: [{ getMessages: () => [msg('a', 0, 'x')] }], responses: () => 401 });
  assert.throws(() => r.sandbox.importBankEmails(), /Copy a fresh script/);
});
