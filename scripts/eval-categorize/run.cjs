// Runs Gemini on your labeled rows with the app's real quick-add prompt (lib/parsePrompt.ts) and records the
// category it picks, the tokens it used and how long it took.
//
//   GEMINI_API_KEY=... node scripts/eval-categorize/run.cjs [--model gemini-2.5-flash] [--thinking on|off] [--set all|tune|test] [--limit N] [--mock]
//
// --thinking off adds thinkingBudget 0 (2.5 models only); the app leaves it on today, which costs more tokens.
// --mock invents answers so you can check the whole pipeline without a key.
const fs = require('node:fs');
const path = require('node:path');
const jiti = require('jiti')(__filename);
const { parseCsv, toCsv, setOf } = require('./lib.cjs');
const { buildParsePrompt, PARSE_GENERATION_CONFIG } = jiti(path.join(__dirname, '../../lib/parsePrompt.ts'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const dir = path.join(__dirname, 'data');
const model = arg('model', 'gemini-2.5-flash');
const thinking = arg('thinking', 'on');
const mock = process.argv.includes('--mock');
const which = arg('set', 'all');
const outFile = path.join(dir, `predictions-${model}-think${thinking}${mock ? '-mock' : ''}.csv`);
const COLS = ['id', 'pred_category', 'pred_type', 'input_tokens', 'output_tokens', 'thought_tokens', 'latency_ms', 'error'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function predictLive(genAI, text, today) {
  const cfg = { ...PARSE_GENERATION_CONFIG, ...(thinking === 'off' && model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}) };
  const m = genAI.getGenerativeModel({ model, generationConfig: cfg });
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    try {
      const r = await m.generateContent(buildParsePrompt(text, today));
      const u = r.response.usageMetadata || {};
      let item = null;
      try { item = (JSON.parse(r.response.text() || '{}').items || [])[0] || null; } catch { /* unparsable answer counts as a miss */ }
      return { pred_category: item?.category || '', pred_type: item?.type || '', input_tokens: u.promptTokenCount || 0, output_tokens: u.candidatesTokenCount || 0, thought_tokens: u.thoughtsTokenCount || 0, latency_ms: Date.now() - t0, error: '' };
    } catch (e) {
      const retry = /429|503|quota|overloaded|ECONNRESET|fetch failed/i.test(e.message);
      if (!retry || attempt >= 4) return { pred_category: '', pred_type: '', input_tokens: 0, output_tokens: 0, thought_tokens: 0, latency_ms: Date.now() - t0, error: e.message.slice(0, 120) };
      await sleep(1000 * 2 ** attempt);
    }
  }
}

const predictMock = (text, id) => ({ pred_category: ['Food & Dining', 'Transport', 'Shopping', 'Other'][id.length % 4], pred_type: 'expense', input_tokens: 420, output_tokens: 40, thought_tokens: thinking === 'on' ? 180 : 0, latency_ms: 300, error: '' });

(async () => {
  const labeled = parseCsv(fs.readFileSync(path.join(dir, 'labeled.csv'), 'utf8')).filter(r => r.true_category && (which === 'all' || setOf(r.id) === which));
  const limit = Number(arg('limit', labeled.length));
  const rows = labeled.slice(0, limit);
  const done = fs.existsSync(outFile) ? parseCsv(fs.readFileSync(outFile, 'utf8')) : [];
  const have = new Map(done.filter(d => !d.error).map(d => [d.id, d]));
  let genAI = null;
  if (!mock) {
    if (!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY (your own key; never commit it), or use --mock.');
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const todo = rows.filter(r => !have.has(r.id));
  console.log(`${rows.length} rows, ${have.size} already done, ${todo.length} to run (${model}, thinking ${thinking}${mock ? ', MOCK' : ''}).`);
  let next = 0, finished = 0;
  const worker = async () => {
    while (next < todo.length) {
      const r = todo[next++];
      const out = mock ? predictMock(r.text, r.id) : await predictLive(genAI, r.text, today);
      have.set(r.id, { id: r.id, ...out });
      if (++finished % 25 === 0) { fs.writeFileSync(outFile, toCsv([...have.values()], COLS)); console.log(`  ${finished}/${todo.length}`); }
    }
  };
  await Promise.all(Array.from({ length: mock ? 1 : 3 }, worker));
  fs.writeFileSync(outFile, toCsv([...have.values()], COLS));
  console.log(`Saved ${path.relative(process.cwd(), outFile)}. Next: node scripts/eval-categorize/report.cjs --pred "${path.basename(outFile)}"`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
