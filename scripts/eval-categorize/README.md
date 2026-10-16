# Measuring Align's AI categorisation

Question: when you add an expense with quick add, how often does Gemini pick the right category from the title, and what
does it cost? This measures the **quick-add prompt** (`/api/parse`) on your own transaction titles, against Align's
keyword rules.
The scripts run on your machine with your own key. Nothing here runs against your data unless you start it, and
`data/` is git-ignored (it holds your real transactions).

## Steps
1. **Export** your expenses (needs your Firebase service-account key in `FIREBASE_SERVICE_ACCOUNT`):
   `node scripts/eval-categorize/export.cjs --phone 91XXXXXXXXXX --limit 500`
   Repeated texts are collapsed so common merchants don't inflate accuracy (`--all` keeps them).
2. **Label** `data/to-label.csv`: fill `true_category` with one of Food & Dining, Groceries, Transport, Shopping,
   Bills & Recharge, Home & Help, Health, Education, Entertainment, Gifts, Other. (Short on time? `node scripts/eval-categorize/prefill.cjs` starts the column from what Align stored, so you only fix the wrong ones; say so in your write-up, because it can flatter Gemini.) Otherwise don't look at what Align stored
   (that's in a separate file on purpose). Save as `data/labeled.csv`.
3. **Run Gemini** with the app's exact prompt (`lib/parsePrompt.ts`; your own `GEMINI_API_KEY`):
   `node scripts/eval-categorize/run.cjs --model gemini-2.5-flash --thinking on`
   Also try `--thinking off` and `--model gemini-2.5-flash-lite`. To test Claude Haiku 5.5, the model quick add can use, run `ANTHROPIC_API_KEY=... node scripts/eval-categorize/run.cjs --provider anthropic` (needs `npm install` first, for the Anthropic package) and report it the same way; its `--pred` file is `predictions-claude-haiku-5-5-thinkdefault.csv`. `--mock` checks the pipeline without a key.
   It resumes if interrupted.
4. **Report**: `node scripts/eval-categorize/report.cjs --pred predictions-gemini-2.5-flash-thinkon.csv --set test`
   Rows split into `tune` and `test` halves by id. Change the prompt looking only at `tune` errors
   (`data/errors.csv`), then quote numbers from `--set test`.
5. **Write it up** from `results/*.md` (aggregates only, safe to commit): rows, accuracy and 95% range, the two
   baselines, cost per 1,000, delay, and the three most common mistakes with what you changed.

## Reading the numbers
- With 400 rows and ~85% right, the 95% range is about ±3.5 points: don't claim differences smaller than that.
- Rows that came from your email or Gmail (bank alerts, statements) are excluded by default, because Align promises
  never to send email data to Gemini. Expect fewer than 300 rows if most of your history came from alerts;
  `--include-email` overrides this on your own data and warns you. The report breaks accuracy down by source.
- Stored titles are already cleaned merchant names, not exactly what you type. The WhatsApp bot uses a different
  prompt and category set, so it is not covered here; nor did I check what the SMS route uses Gemini for.
- Card-bill payments are skipped (they aren't a category you'd label).
- The app leaves Gemini's thinking on, which costs extra output tokens. `--thinking off` shows the saving and what
  it does to accuracy.
- `prices.json` is from memory: check Google's pricing page before you quote a cost.
