// Fund confirmations from SMS/email become holdings: `npm run test:emulator`.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.FIREBASE_PROJECT_ID = 'demo-align';
process.env.GCLOUD_PROJECT = 'demo-align';
const PHONE = '919876500088';
const NAV = 'Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date\n' +
  Array.from({ length: 1100 }, (_, i) => `2${String(i).padStart(5, '0')};X;Y;Filler Fund ${i};Direct;Growth;10.0;23-Oct-2026`).join('\n') +
  '\n118955;INF1;INF2;HDFC Flexi Cap Fund - Direct Plan - Growth Option;Direct Plan;Growth;2000.00;23-Oct-2026\n';
const realFetch = global.fetch;
global.fetch = async (url, opts) => String(url).includes('amfiindia.com') ? new Response(NAV) : realFetch(url, opts);

const jiti = require('jiti')(__filename);
const { recordInvestment } = jiti(path.join(__dirname, '../../lib/investTrack.ts'));
const { parseInvestment } = jiti(path.join(__dirname, '../../lib/investParse.ts'));
const { db } = jiti(path.join(__dirname, '../../lib/firebase.ts'));
const holdings = async () => (await db.collection('money_accounts').doc(PHONE).collection('holdings').get()).docs.map(d => d.data());
const at = Date.now();

test('a purchase, a repeat, a SIP without units and a redemption', async () => {
  const buy = parseInvestment('Your purchase of Rs. 5,000.00 in HDFC Flexi Cap Fund - Direct Plan - Growth has been processed. Units allotted: 2.5 at NAV Rs 2000. Order No: ABC123456');
  assert.equal(await recordInvestment(PHONE, buy, at), 'added');
  assert.equal(await recordInvestment(PHONE, buy, at), 'duplicate', 'the same order counts once');
  let [h] = await holdings();
  assert.deepEqual([h.units, h.invested, h.schemeCode, h.auto, h.owner], [2.5, 5000, '118955', true, 'me']);

  const sip = parseInvestment('SIP of Rs 2,000 in HDFC Flexi Cap Fund Direct Plan Growth processed on 05-11-26.');
  assert.equal(await recordInvestment(PHONE, sip, at + 86400000), 'added');
  [h] = await holdings();
  assert.deepEqual([h.units, h.invested], [3.5, 7000]); // 2000 / NAV 2000 = 1 unit

  const sell = parseInvestment('Redemption of 1.75 units of HDFC Flexi Cap Fund Direct Plan Growth processed. Order No: RED987654');
  assert.equal(await recordInvestment(PHONE, sell, at + 2 * 86400000), 'added');
  [h] = await holdings();
  assert.deepEqual([h.units, h.invested], [1.75, 3500]);

  const rest = parseInvestment('Redemption of 1.75 units of HDFC Flexi Cap Fund Direct Plan Growth processed. Order No: RED111222');
  assert.equal(await recordInvestment(PHONE, rest, at + 3 * 86400000), 'added');
  assert.equal((await holdings()).length, 0, 'sold out: the holding goes');
  assert.equal(await recordInvestment(PHONE, parseInvestment('Redemption of 1 units of HDFC Flexi Cap Fund Direct Plan Growth processed. Order No: RED333444'), at), 'ignored');
});
after(async () => { await require('firebase-admin/app').deleteApp(require('firebase-admin/app').getApp()).catch(() => {}); });
