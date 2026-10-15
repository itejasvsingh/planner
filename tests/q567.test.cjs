const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../lib/q567.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { buildQ567Classes } = mod.exports;

// Made-up timetable; real q567 data never goes in this repo
const daily = {
  '2026-10-15 Thursday': {
    '8am-10am': 'SS / MS5750',
    '10am-12pm': 'MS6210',
    '1pm-3pm': [{ text: 'ICRC lecture' }],
    '3pm-5pm': 'MS6030',
    '5pm-7pm': { text: 'MS5529', strike: true },
    Comments: 'Bring laptop',
  },
  '2026-10-16 Friday': { '8am-10am': 'MS6580', '1pm-3pm': 'MS6022' },
};
const base = { daily, changes: {}, electives: ['MS5750'] };

test('your electives and the core courses appear, with the sheet slot times and rooms', () => {
  const r = buildQ567Classes(base);
  assert.deepEqual(r.map(c => [c.date, c.start, c.code, c.status]), [
    ['2026-10-15', '08:00', 'MS5750', 'ok'],
    ['2026-10-15', '10:00', 'MS6210', 'ok'],
    ['2026-10-15', '13:00', 'ICRC', 'ok'],
    ['2026-10-15', '17:00', 'MS5529', 'cancelled'],
  ], 'MS6030 and the Friday electives are not yours');
  assert.equal(r[0].room, '252');
  assert.equal(r[1].title, 'Business Models');
});

test('shared updates: cancelled, retimed, moved in; hidden sessions disappear', () => {
  const changes = {
    '2026-10-15': {
      '8am-10am_MS5750': { status: 'cancelled', note: 'Prof away' },
      '10am-12pm_MS6210': { status: 'retimed', start: '11:00', end: '12:30' },
    },
    '2026-10-14': { '1pm-3pm_MS5750': { status: 'moved', code: 'MS5750', toYmd: '2026-10-17', toSlot: '3pm-5pm' } },
  };
  const r = buildQ567Classes({ ...base, changes, hidden: { '2026-10-15_17:00': 1 } });
  const by = code => r.filter(c => c.code === code);
  assert.equal(by('MS5750')[0].status, 'cancelled');
  assert.equal(by('MS5750')[0].note, 'Prof away');
  assert.deepEqual([by('MS6210')[0].start, by('MS6210')[0].end, by('MS6210')[0].status], ['11:00', '12:30', 'retimed']);
  const moved = by('MS5750').find(c => c.status === 'moved');
  assert.deepEqual([moved.date, moved.start], ['2026-10-17', '15:00']);
  const hidden = buildQ567Classes({ ...base, hidden: { '2026-10-15_10am-12pm_MS6210': true } });
  assert.equal(hidden.find(c => c.code === 'MS6210'), undefined);
});

test('pushed data is cleaned: no names or rolls get through, odd keys and slots are dropped', () => {
  const { sanitizeQ567Push } = mod.exports;
  const clean = sanitizeQ567Push({
    daily: { '2026-10-15 Thursday': { '8am-10am': 'MS5750', 'bogus': 'x', '12pm-1pm': 'lunch' }, 'junk': { '8am-10am': 'x' } },
    changes: { '2026-10-15': { '8am-10am_MS5750': { status: 'cancelled', byName: 'Someone', byRoll: 'MS00X000', at: 1, note: 'Prof away' } } },
    electives: ['MS5750', 5, 'MS6030'],
    hidden: { '2026-10-15_8am-10am_MS5750': 1 },
    attendance: { secret: true },
  });
  assert.deepEqual(Object.keys(clean.daily), ['2026-10-15 Thursday']);
  assert.deepEqual(Object.keys(clean.daily['2026-10-15 Thursday']), ['8am-10am']);
  const ch = clean.changes['2026-10-15']['8am-10am_MS5750'];
  assert.equal(ch.note, 'Prof away');
  assert.equal(JSON.stringify(clean).includes('Someone'), false);
  assert.equal(JSON.stringify(clean).includes('MS00X000'), false);
  assert.deepEqual(clean.electives, ['MS5750', 'MS6030']);
  assert.equal(sanitizeQ567Push({ nothing: 1 }), null);
});
