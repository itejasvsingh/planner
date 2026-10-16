// Exports your expense rows to label. YOU run this, on your machine, with your own Firebase key; the output stays in
// data/ (git-ignored). The label file hides what Align stored, so you label without being nudged.
//
//   FIREBASE_SERVICE_ACCOUNT=<json or base64> node scripts/eval-categorize/export.cjs --phone 91XXXXXXXXXX [--limit 500] [--all]
//
// By default repeated texts are collapsed (one "Swiggy" counts once): otherwise common merchants inflate accuracy.
// Rows that came from your email or Gmail (bank alerts, statements) are left out: Align promises that email data is
// never sent to Gemini, and run.cjs sends these rows to Gemini. --include-email overrides that, for your own data, knowingly.
const fs = require('node:fs');
const path = require('node:path');
const jiti = require('jiti')(__filename);
const { toCsv, setOf, norm } = require('./lib.cjs');
const { getPhoneVariants } = jiti(path.join(__dirname, '../../lib/phone.ts'));
const { isCardPayment } = jiti(path.join(__dirname, '../../align-native/src/lib/finance-analysis.ts'));
const FROM_EMAIL = new Set(['gmail', 'email', 'statement']);

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };

(async () => {
  const phone = arg('phone');
  if (!phone) throw new Error('Pass --phone <your number as stored, e.g. 919876543210>.');
  const limit = Number(arg('limit', 500));
  if (!/\d{10}/.test(phone)) throw new Error(`--phone must be your real number in digits (like 9876543210), not "${phone}".`);
  const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));
  const includeEmail = process.argv.includes('--include-email');
  if (includeEmail) console.warn('WARNING: including rows that came from email/Gmail. run.cjs will send their text to Gemini, which Align promises not to do with email data.');
  // Items are stored under any spelling of the number
  const snap = await db.collection('planner_items').where('ownerId', 'in', getPhoneVariants(phone)).where('type', '==', 'expense').get();
  const seen = new Set();
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.title && Number(r.amount) > 0 && !isCardPayment({ type: 'expense', category: r.category, title: r.title }) && (includeEmail || !FROM_EMAIL.has(r.source)))
    .map(r => ({ id: r.id, source: r.source || (r.origin ? String(r.origin) : 'manual'), text: `${String(r.title).trim()} ${Number(r.amount)}`, amount: Number(r.amount), date: r.date || '', stored: r.category || '', key: norm(r.title) }))
    .sort((a, b) => (setOf(a.id) + a.id).localeCompare(setOf(b.id) + b.id));
  if (!process.argv.includes('--all')) rows = rows.filter(r => (seen.has(r.key) ? false : seen.add(r.key)));
  rows = rows.slice(0, limit);
  const dir = path.join(__dirname, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'to-label.csv'), toCsv(rows.map(r => ({ ...r, true_category: '' })), ['id', 'text', 'amount', 'date', 'source', 'true_category']));
  fs.writeFileSync(path.join(dir, 'stored-categories.csv'), toCsv(rows, ['id', 'stored']));
  console.log(`Wrote ${rows.length} rows to data/to-label.csv${rows.length < 300 ? ' (fewer than 300: your email-sourced rows are excluded; add more by hand or accept a wider range)' : ''}. Fill the true_category column (save as data/labeled.csv), using only: Food & Dining, Groceries, Transport, Shopping, Bills & Recharge, Home & Help, Health, Education, Entertainment, Gifts, Other.`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
