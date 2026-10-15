// Sends your class timetable from the q567 planner to Align. Run it from the q567 project (see README.md), never from
// a place Align's code runs: Align holds no key to q567, it only receives this.
//
// Needs: npm i firebase-admin
// Env:   Q567_SERVICE_ACCOUNT (q567mba service-account JSON, raw or base64) or Q567_KEY_FILE (path to it)
//        Q567_ROLL (your roll number)  ALIGN_URL (e.g. https://alignplanner.vercel.app)  ALIGN_PUSH_SECRET
// Flag:  --dry   read and summarise, send nothing
//
// Reads only: schedule/daily, schedule_changes (dropping who posted them), and, under YOUR roll, the elective picks
// and hidden sessions. Never attendance, groups, names or anyone else's roll.
const fs = require('node:fs');
const { cert, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const DATABASE_URL = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app';
const CHANGE_FIELDS = ['status', 'code', 'toYmd', 'toSlot', 'start', 'end', 'note'];

function key() {
  const raw = process.env.Q567_SERVICE_ACCOUNT?.trim() || (process.env.Q567_KEY_FILE ? fs.readFileSync(process.env.Q567_KEY_FILE, 'utf8') : '');
  if (!raw) throw new Error('Set Q567_SERVICE_ACCOUNT or Q567_KEY_FILE.');
  return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
}

async function main() {
  const roll = (process.env.Q567_ROLL || '').trim().toUpperCase();
  if (!roll) throw new Error('Set Q567_ROLL.');
  const safeRoll = roll.replace(/[.#$[\]]/g, '_');
  const app = initializeApp({ credential: cert(key()), databaseURL: DATABASE_URL, databaseAuthVariableOverride: { uid: 'align-pusher' } });
  const db = getDatabase(app);
  const [daily, changes, selections, hidden] = await Promise.all([
    db.ref('schedule/daily').get(),
    db.ref('schedule_changes').get(),
    db.ref(`roll_preferences/${safeRoll}/selections`).get(),
    db.ref(`roll_preferences/${safeRoll}/hiddenSessions`).get(),
  ]);

  const cleanChanges = {};
  for (const [ymd, byKey] of Object.entries(changes.val() || {})) {
    cleanChanges[ymd] = {};
    for (const [k, ch] of Object.entries(byKey || {})) cleanChanges[ymd][k] = Object.fromEntries(CHANGE_FIELDS.filter(f => ch && ch[f] != null).map(f => [f, ch[f]]));
  }
  const electives = Object.values((selections.val() || {}).Q6 || {}).map(s => s && s.code).filter(Boolean);
  const payload = { daily: daily.val() || {}, changes: cleanChanges, electives, hidden: hidden.val() || {} };
  console.log(`Read ${Object.keys(payload.daily).length} days, ${Object.keys(cleanChanges).length} days with updates, ${electives.length} electives.`);
  if (process.argv.includes('--dry')) return;

  const res = await fetch(`${process.env.ALIGN_URL.replace(/\/$/, '')}/api/q567/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ALIGN_PUSH_SECRET}` },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Align said ${res.status}: ${body.slice(0, 200)}`);
  console.log('Sent to Align:', body);
}

main().then(() => process.exit(0), e => { console.error(e.message); process.exit(1); });
