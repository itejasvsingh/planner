const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../align-native/src/lib/notes.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
const { noteHeading, notePreview, sortNotes, searchNotes, editedLabel, isNote } = mod.exports;

test('heading is the title, else the first line of the text', () => {
  assert.equal(noteHeading({ title: 'Wifi', body: 'abc' }), 'Wifi');
  assert.equal(noteHeading({ title: '  ', body: '\nHostel room 214\nblock B' }), 'Hostel room 214');
  assert.equal(noteHeading({}), 'Untitled note');
  assert.equal(notePreview({ title: '', body: 'Hostel room 214\nblock B\n\nnear gate' }), 'block B\nnear gate');
  assert.equal(notePreview({ title: 'Room', body: 'Hostel room 214' }), 'Hostel room 214');
});

test('pinned first, then newest edit; search needs every word', () => {
  const notes = [
    { id: 'a', type: 'note', title: 'Old', updatedAt: '2026-10-01T10:00:00Z' },
    { id: 'b', type: 'note', title: 'New', body: 'buy milk and eggs', updatedAt: '2026-10-03T10:00:00Z' },
    { id: 'c', type: 'note', title: 'Pinned', pinned: true, updatedAt: '2026-09-01T10:00:00Z' },
  ];
  assert.deepEqual(sortNotes(notes).map(n => n.id), ['c', 'b', 'a']);
  assert.deepEqual(searchNotes(notes, 'EGGS milk').map(n => n.id), ['b']);
  assert.deepEqual(searchNotes(notes, '  ').length, 3);
  assert.equal(isNote({ type: 'task' }), false);
});

test('edited labels', () => {
  const now = new Date('2026-10-04T12:00:00');
  assert.equal(editedLabel(new Date('2026-10-04T11:59:40').toISOString(), now), 'Just now');
  assert.equal(editedLabel(new Date('2026-10-04T11:45:00').toISOString(), now), '15 min ago');
  assert.equal(editedLabel(new Date('2026-10-03T09:00:00').toISOString(), now), 'Yesterday');
  assert.equal(editedLabel(new Date('2026-09-12T09:00:00').toISOString(), now), '12 Sept');
  assert.equal(editedLabel(undefined, now), '');
});
