// Turns labeled.csv + a predictions file into the numbers for your write-up: accuracy with a 95% interval,
// baselines, per-category scores, the most common confusions, tokens, delay and cost per 1,000.
//
//   node scripts/eval-categorize/report.cjs --pred predictions-gemini-2.5-flash-thinkon.csv [--set test]
//
// results/<name>.md holds aggregates only and is safe to commit. data/errors.csv has the actual texts: keep it local.
const fs = require('node:fs');
const path = require('node:path');
const jiti = require('jiti')(__filename);
const { parseCsv, toCsv, setOf, norm, metrics, wilson, costPer1000 } = require('./lib.cjs');
const { guessCategory } = jiti(path.join(__dirname, '../../lib/smsParse.ts'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const dir = path.join(__dirname, 'data');
const predName = arg('pred');
if (!predName) throw new Error('Pass --pred <file in data/>, as printed by run.cjs.');
const which = arg('set', 'all');
const pct = x => `${(x * 100).toFixed(1)}%`;
const ci = ([a, b]) => `${pct(a)}–${pct(b)}`;

const labeled = parseCsv(fs.readFileSync(path.join(dir, 'labeled.csv'), 'utf8')).filter(r => r.true_category && (which === 'all' || setOf(r.id) === which));
const preds = new Map(parseCsv(fs.readFileSync(path.join(dir, predName), 'utf8')).map(p => [p.id, p]));
const rows = labeled.filter(r => preds.has(r.id));
// Show categories the way you wrote them, not lower-cased
const canon = new Map(labeled.map(r => [norm(r.true_category), r.true_category.trim()]));
const nice = c => canon.get(c) || c;
const ok = rows.filter(r => !preds.get(r.id).error);
const failed = rows.length - ok.length;

const gemini = metrics(ok.map(r => ({ truth: r.true_category, pred: preds.get(r.id).pred_category })));
const counts = new Map();
for (const r of rows) counts.set(norm(r.true_category), (counts.get(norm(r.true_category)) || 0) + 1);
const [majority, majorityN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
const rules = metrics(rows.map(r => ({ truth: r.true_category, pred: guessCategory(r.text.replace(/\s+[\d.]+$/, ''), 'expense') })));
let stored = null;
const storedFile = path.join(dir, 'stored-categories.csv');
if (fs.existsSync(storedFile)) {
  const s = new Map(parseCsv(fs.readFileSync(storedFile, 'utf8')).map(x => [x.id, x.stored]));
  stored = metrics(rows.filter(r => s.has(r.id)).map(r => ({ truth: r.true_category, pred: s.get(r.id) })));
}
const typeOk = ok.filter(r => preds.get(r.id).pred_type === 'expense').length;

const avg = k => ok.reduce((s, r) => s + Number(preds.get(r.id)[k] || 0), 0) / (ok.length || 1);
const tokens = { input: avg('input_tokens'), output: avg('output_tokens'), thought: avg('thought_tokens') };
const lat = ok.map(r => Number(preds.get(r.id).latency_ms)).sort((a, b) => a - b);
const q = p => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] || 0;
const model = (predName.match(/^predictions-(.+?)-think/) || [])[1] || 'unknown';
const prices = JSON.parse(fs.readFileSync(path.join(__dirname, 'prices.json'), 'utf8'));
const price = prices[model];
const cost = price ? costPer1000(tokens, price) : null;

const lines = [];
const out = s => { lines.push(s); console.log(s); };
out(`# Categorisation accuracy: ${predName.replace(/^predictions-|\.csv$/g, '')} (set: ${which})`);
out('');
out(`- Rows labeled: ${rows.length}; answered: ${ok.length}${failed ? `; failed: ${failed}` : ''}`);
out(`- **Gemini category accuracy: ${pct(gemini.accuracy)}** (95% range ${ci(gemini.ci)})`);
out(`- Read as a spend (type = expense): ${pct(typeOk / (ok.length || 1))}`);
out(`- Baseline, always "${nice(majority)}": ${pct(majorityN / (rows.length || 1))}`);
out(`- Baseline, Align's keyword rules: ${pct(rules.accuracy)} (95% range ${ci(rules.ci)})`);
if (stored) out(`- What Align has stored today (includes your own edits): ${pct(stored.accuracy)}`);
out(`- Tokens per request: ${tokens.input.toFixed(0)} in, ${tokens.output.toFixed(0)} out${tokens.thought ? `, ${tokens.thought.toFixed(0)} thinking` : ''}`);
out(`- Delay: median ${q(0.5)} ms, 95th percentile ${q(0.95)} ms`);
out(cost === null ? `- Cost per 1,000: add "${model}" to prices.json` : `- **Cost per 1,000 requests: $${cost.toFixed(3)}** (at $${price.input}/M in, $${price.output}/M out; check prices.json)`);
const bySource = new Map();
for (const r of ok) { const k = r.source || 'unknown'; (bySource.get(k) || bySource.set(k, []).get(k)).push({ truth: r.true_category, pred: preds.get(r.id).pred_category }); }
if (bySource.size > 1) { out('');
  out('By where the row came from:');
  for (const [k, v] of bySource) { const m = metrics(v); out(`- ${k}: ${pct(m.accuracy)} on ${m.n} rows`); } }
out('');
out('| Category | Rows | Precision | Recall | F1 |');
out('|---|---:|---:|---:|---:|');
for (const c of gemini.per.filter(p => p.support || p.precision !== null)) out(`| ${nice(c.category)} | ${c.support} | ${c.precision === null ? '-' : pct(c.precision)} | ${c.recall === null ? '-' : pct(c.recall)} | ${c.f1 === null ? '-' : pct(c.f1)} |`);
out('');
out('Most common mistakes (truth -> Gemini):');
for (const c of gemini.confusions.slice(0, 8)) out(`- ${c.pair.split(' -> ').map(nice).join(' -> ')}: ${c.count}`);

fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', `${predName.replace(/\.csv$/, '')}-${which}.md`), lines.join('\n') + '\n');
fs.writeFileSync(path.join(dir, 'errors.csv'), toCsv(ok.filter(r => norm(r.true_category) !== norm(preds.get(r.id).pred_category)).map(r => ({ id: r.id, text: r.text, truth: r.true_category, gemini: preds.get(r.id).pred_category })), ['id', 'text', 'truth', 'gemini']));
console.log('\nSaved results/*.md (safe to commit) and data/errors.csv (local only).');
