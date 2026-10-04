// Endpoints that must refuse strangers: `npm run test:emulator`. No real WhatsApp or Gemini calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHmac } = require('node:crypto');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
process.env.WHATSAPP_APP_SECRET = 'test-app-secret';

const jiti = require('jiti')(__filename);
const webhook = jiti(path.join(__dirname, '../../app/api/webhook/route.ts'));
const parse = jiti(path.join(__dirname, '../../app/api/parse/route.ts'));
const summary = jiti(path.join(__dirname, '../../app/api/cron/daily-summary/route.ts'));

const fake = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: '919800000999', id: 'x', type: 'text', text: { body: 'hi' } }] } }] }] });
const post = (url, body, headers = {}) => new Request(url, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });

test('WhatsApp webhook: posts without a valid Meta signature are refused', async () => {
  assert.equal((await webhook.POST(post('https://x.test/api/webhook', fake))).status, 401);
  assert.equal((await webhook.POST(post('https://x.test/api/webhook', fake, { 'x-hub-signature-256': 'sha256=' + 'ab'.repeat(32) }))).status, 401);
  // a correctly signed post gets past the check (then ignored as too old: no timestamp → processed normally is fine too)
  const sig = 'sha256=' + createHmac('sha256', 'test-app-secret').update('{"object":"other"}').digest('hex');
  assert.notEqual((await webhook.POST(post('https://x.test/api/webhook', '{"object":"other"}', { 'x-hub-signature-256': sig }))).status, 401);
});

test('parse: signed-in only; a phone number in the request is not enough', async () => {
  const res = await parse.POST(post('https://x.test/api/parse', JSON.stringify({ text: 'coffee 50', phone: '919800000999' })));
  assert.equal(res.status, 401);
});

test('daily summary: the old test secret no longer works', async () => {
  process.env.TEST_SUMMARY_SECRET = 'old-leaked-secret';
  process.env.CRON_SECRET = 'cron-secret';
  const res = await summary.GET(new Request('https://x.test/api/cron/daily-summary?phone=919800000999&secret=old-leaked-secret'));
  assert.equal(res.status, 401);
});
