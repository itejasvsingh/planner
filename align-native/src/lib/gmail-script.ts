/**
 * The Google Apps Script the user installs in their own Gmail to forward bank alert emails to Align.
 * Pure (no imports) so tests can run the generated script against mocked Google services
 * (tests/gmail-script.test.cjs).
 */

/** Senders the script reads (every bank Align knows; mirrors lib/bankSenders.ts). Users can add theirs at the top of the script. */
export const BANK_DOMAINS = [
  'slice.bank.in', 'sliceit.com', 'hdfcbank.net', 'hdfcbank.com', 'hdfcbank.bank.in', 'hdfc.bank.in',
  'icicibank.com', 'icicibank.bank.in', 'icici.bank.in', 'sbi.co.in', 'sbi.bank.in', 'sbicard.com',
  'axisbank.com', 'axisbank.bank.in', 'axis.bank.in', 'kotak.com', 'kotak.bank.in', 'yesbank.in',
  'yesbank.bank.in', 'idfcfirstbank.com', 'idfcfirst.bank.in', 'indusind.com', 'indusind.bank.in',
  'aubank.in', 'au.bank.in', 'federalbank.co.in', 'federalbank.bank.in', 'bankofbaroda.co.in',
  'bobcard.co.in', 'bankofbaroda.bank.in', 'pnb.co.in', 'pnb.bank.in', 'canarabank.com',
  'canarabank.bank.in', 'unionbankofindia.co.in', 'unionbankofindia.bank.in', 'bankofindia.co.in',
  'bankofindia.bank.in', 'idbibank.co.in', 'idbi.bank.in', 'rblbank.com', 'rbl.bank.in', 'bandhanbank.com',
  'bandhan.bank.in', 'iob.in', 'iob.bank.in', 'indianbank.in', 'indianbank.bank.in', 'sc.com', 'hsbc.co.in',
  'citi.com', 'dbs.com', 'americanexpress.com', 'getonecard.app', 'jupiter.money', 'fi.money', 'bank.in',
];

export function gmailScript(link: string) {
  return `/**
 * Align: adds your bank alert emails to Align.
 *
 * Runs inside your own Google account. It only reads emails from the bank addresses below and sends their
 * text to your personal Align link; nothing else leaves your account. To stop, delete this project.
 *
 * First time: choose "setup" in the menu above and press Run, then allow access.
 */
const ALIGN_LINK = ${JSON.stringify(link)};

// Add your bank's email domain here if it's missing.
const BANKS = ${JSON.stringify(BANK_DOMAINS)};

const FIRST_RUN_DAYS = 30;

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('importBankEmails').timeBased().everyMinutes(15).create();
  importBankEmails();
}

function importBankEmails() {
  const props = PropertiesService.getScriptProperties();
  const firstRun = !props.getProperty('started');
  const days = firstRun ? FIRST_RUN_DAYS : 3;
  const cutoff = Date.now() - days * 86400000;
  const query = 'from:(' + BANKS.join(' OR ') + ') newer_than:' + days + 'd -in:spam -in:trash';
  let added = 0;
  let checked = 0;
  for (let start = 0; start < 500; start += 100) {
    const threads = GmailApp.search(query, start, 100);
    for (const thread of threads) {
      for (const msg of thread.getMessages()) {
        const at = msg.getDate();
        if (at.getTime() < cutoff) continue;
        // Remember what was sent, per day; bank alerts with the same subject share one Gmail thread.
        const key = 'seen_' + Utilities.formatDate(at, 'Asia/Kolkata', 'yyyy-MM-dd');
        const seen = (props.getProperty(key) || '').split(',').filter(String);
        if (seen.indexOf(msg.getId()) >= 0) continue;
        const res = UrlFetchApp.fetch(ALIGN_LINK, {
          method: 'post',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify({ source: 'email', text: msg.getSubject() + '\\n' + msg.getPlainBody().slice(0, 6000), date: at.toISOString() }),
        });
        const code = res.getResponseCode();
        if (code === 401) throw new Error('Align no longer accepts this link. Copy a fresh script from Align > Settings > Email Auto-Import.');
        if (code === 429 || code >= 500) {
          console.log('Align is busy; the rest will be added on the next run.');
          return;
        }
        checked++;
        if (JSON.parse(res.getContentText() || '{}').status === 'added') added++;
        seen.push(msg.getId());
        props.setProperty(key, seen.join(','));
      }
    }
    if (threads.length < 100) break;
  }
  props.setProperty('started', '1');
  // Forget days older than the first-run window.
  const oldest = Utilities.formatDate(new Date(Date.now() - (FIRST_RUN_DAYS + 5) * 86400000), 'Asia/Kolkata', 'yyyy-MM-dd');
  props.getKeys().forEach(function (k) { if (k.indexOf('seen_') === 0 && k.slice(5) < oldest) props.deleteProperty(k); });
  console.log('Align: checked ' + checked + ' new bank emails, added ' + added + ' transactions.');
}
`;
}
