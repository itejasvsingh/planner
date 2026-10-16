// Faster labeling: starts true_category from what Align stored, so you only fix the wrong ones.
// Caveat for your write-up: some stored categories came from Gemini or your own edits, so this can make Gemini look a
// little better than it is. Only change what is really wrong; don't just accept what is there.
//
//   node scripts/eval-categorize/prefill.cjs        then open data/labeled-prefilled.csv, fix it, save as data/labeled.csv
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, toCsv, norm } = require('./lib.cjs');

const dir = path.join(__dirname, 'data');
const ALLOWED = ['Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Recharge', 'Home & Help', 'Health', 'Education', 'Entertainment', 'Gifts', 'Other'];
const byNorm = new Map(ALLOWED.map(c => [norm(c), c]));

const rows = parseCsv(fs.readFileSync(path.join(dir, 'to-label.csv'), 'utf8'));
const stored = new Map(parseCsv(fs.readFileSync(path.join(dir, 'stored-categories.csv'), 'utf8')).map(r => [r.id, r.stored]));
let filled = 0;
const out = rows.map(r => {
  const c = byNorm.get(norm(stored.get(r.id)));
  if (c) filled++;
  return { ...r, true_category: c || '' };
});
fs.writeFileSync(path.join(dir, 'labeled-prefilled.csv'), toCsv(out, ['id', 'text', 'amount', 'date', 'source', 'true_category']));
console.log(`Pre-filled ${filled} of ${rows.length} rows (the rest use category names outside the list: fill those yourself).`);
console.log('Open data/labeled-prefilled.csv, fix every wrong or blank category, save as data/labeled.csv.');
