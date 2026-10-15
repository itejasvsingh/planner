// Plain helpers for the categorisation evaluation: CSV, a stable split, and the metrics. No network, no Align data.
const crypto = require('node:crypto');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(c => c !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return (head ? body : []).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

const esc = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n';

/** The same row always lands in the same half, so tuning on `tune` never leaks into the `test` numbers. */
const setOf = id => (crypto.createHash('sha256').update(String(id)).digest()[0] % 2 === 0 ? 'tune' : 'test');

const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** 95% Wilson interval for a share (better than ±1/√n near 0 or 1). */
function wilson(correct, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = correct / n, d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** pairs: [{ truth, pred }]. Accuracy, per-category precision/recall/F1 and the most common confusions. */
function metrics(pairs) {
  const n = pairs.length;
  const correct = pairs.filter(p => norm(p.truth) === norm(p.pred)).length;
  const cats = [...new Set(pairs.flatMap(p => [norm(p.truth), norm(p.pred)]).filter(Boolean))].sort();
  const per = cats.map(c => {
    const tp = pairs.filter(p => norm(p.truth) === c && norm(p.pred) === c).length;
    const fp = pairs.filter(p => norm(p.truth) !== c && norm(p.pred) === c).length;
    const fn = pairs.filter(p => norm(p.truth) === c && norm(p.pred) !== c).length;
    const precision = tp + fp ? tp / (tp + fp) : null;
    const recall = tp + fn ? tp / (tp + fn) : null;
    const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : precision === null || recall === null ? null : 0;
    return { category: c, support: tp + fn, precision, recall, f1 };
  });
  const conf = new Map();
  for (const p of pairs) if (norm(p.truth) !== norm(p.pred)) { const k = `${norm(p.truth)} -> ${norm(p.pred) || '(none)'}`; conf.set(k, (conf.get(k) || 0) + 1); }
  const confusions = [...conf.entries()].sort((a, b) => b[1] - a[1]).map(([pair, count]) => ({ pair, count }));
  return { n, correct, accuracy: n ? correct / n : 0, ci: wilson(correct, n), per, confusions };
}

/** Cost per 1,000 requests from average tokens and $ per million tokens. */
const costPer1000 = (avg, price) => ((avg.input * price.input + (avg.output + avg.thought) * price.output) * 1000) / 1e6;

module.exports = { parseCsv, toCsv, setOf, norm, wilson, metrics, costPer1000 };
