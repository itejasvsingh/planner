const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../lib/announcementParse.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { parseAnnouncement } = mod.exports;

const MSG = `📢 *The Department of Management Studies (DoMS), IIT Madras* invites you to the ICRC Management Lecture Series featuring *Subbaiyan V., VP of Product Management at Nasdaq*

📌 *Topic:* Product Strategy in Technology M&A

📅 *Date:* 15th October, 2026 (Thursday)
🕒 *Time:* 1:50 PM
📍 *Venue:* CLT Hall

⚠️ *Points to Note:*
1. *Attendance will be taken at 1:40 PM.* The session begins at 1:50 PM sharp.
4. *Absence without prior approval* will invite disciplinary action.
Yamini Krishna: 94947 75456 | Vishaal KJ: 99443 89497`;

test('forwarded lecture announcement: right day, start time, purpose and attendance reminder', () => {
  const a = parseAnnouncement(MSG, '2026-10-13');
  assert.equal(a.dueDate, '2026-10-15');
  assert.equal(a.dueTime, '13:50');
  assert.equal(a.reminderTime, '13:40');
  assert.equal(a.venue, 'CLT Hall');
  assert.equal(a.title, 'Lecture: Product Strategy in Technology M&A (CLT Hall)');
});

test('day without a year that already passed means next year; month-first and plain messages', () => {
  assert.equal(parseAnnouncement('Exam on Oct 5 at 9 am', '2026-10-13').dueDate, '2027-10-05');
  assert.equal(parseAnnouncement('Submit report by 20 Oct', '2026-10-13').dueDate, '2026-10-20');
  const none = parseAnnouncement('call mom', '2026-10-13');
  assert.equal(none.dueDate, null);
  assert.equal(none.dueTime, null);
});
