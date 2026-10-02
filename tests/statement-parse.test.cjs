const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../lib/statementParse.ts'), 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', out)(mod, mod.exports);
const { tableToRows, linesToRows, cleanNarration, parseDateCell, parseMoney } = mod.exports;

const brief = r => [r.date, r.type, r.amount];

test('dates and amounts in the formats banks use', () => {
  assert.equal(parseDateCell('01/10/26'), '2026-10-01');
  assert.equal(parseDateCell('30-09-2026'), '2026-09-30');
  assert.equal(parseDateCell('05 Sep 2026'), '2026-09-05');
  assert.equal(parseDateCell('05-Sept-26'), '2026-09-05');
  assert.equal(parseDateCell(46296), '2026-10-01'); // Excel serial
  assert.equal(parseDateCell('Opening Balance'), null);
  assert.equal(parseMoney('1,23,456.78').value, 123456.78);
  assert.equal(parseMoney('1,200.00 Dr').marker, 'dr');
  assert.equal(parseMoney('(120.00)').negative, true);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('0.00'), null);
});

test('HDFC-style sheet: title rows, withdrawal/deposit columns, value date ignored', () => {
  const table = [
    ['HDFC BANK Ltd.', '', '', '', '', '', ''],
    ['Statement of account', '', '', '', '', '', ''],
    ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['********', '********', '', '', '', '', ''],
    ['01/10/26', 'UPI-ZOMATO LTD-ZOMATO@HDFCBANK-HDFC0000001-427512345678-PAYMENT', '0000427512345678', '01/10/26', '250.00', '', '9,750.00'],
    ['30/09/26', 'NEFT CR-ICIC0000001-ACME CORP-SALARY SEP', 'N273260000123', '30/09/26', '', '85,000.00', '10,000.00'],
    ['', 'STATEMENT SUMMARY', '', '', '', '', ''],
  ];
  const rows = tableToRows(table);
  assert.deepEqual(rows.map(brief), [['2026-10-01', 'expense', 250], ['2026-09-30', 'income', 85000]]);
  assert.equal(rows[0].ref, '427512345678');
  assert.equal(cleanNarration(rows[0].description), 'Zomato');
  assert.equal(cleanNarration(rows[1].description), 'Salary · Acme Corp');
});

test('signed amount column (negative = money out) and Dr/Cr column', () => {
  const signed = [['Transaction Date', 'Description', 'Amount', 'Balance'], ['02-10-2026', 'UPI/P2M/427500011122/BLINKIT', '-120.50', '880'], ['03-10-2026', 'IMPS/P2A/427566677788/RAHUL', '2000', '2880']];
  assert.deepEqual(tableToRows(signed).map(brief), [['2026-10-02', 'expense', 120.5], ['2026-10-03', 'income', 2000]]);
  const drcr = [['Txn Date', 'Particulars', 'Amount', 'Dr / Cr'], ['04/10/2026', 'POS 4321XXXX9876 AMAZON PAY IN', '3,250.00', 'DR'], ['05/10/2026', 'REFUND AMAZON', '499.00', 'CR']];
  assert.deepEqual(tableToRows(drcr).map(brief), [['2026-10-04', 'expense', 3250], ['2026-10-05', 'income', 499]]);
  assert.equal(cleanNarration('POS 4321XXXX9876 AMAZON PAY IN'), 'Amazon');
});

test('card export with only positive amounts reads them as spends, refunds as income', () => {
  const t = [['Date', 'Transaction Details', 'Amount (INR)'], ['06 Oct 2026', 'SWIGGY BANGALORE', '412.00'], ['07 Oct 2026', 'REFUND - MYNTRA', '999.00']];
  assert.deepEqual(tableToRows(t).map(brief), [['2026-10-06', 'expense', 412], ['2026-10-07', 'income', 999]]);
});

test('PDF lines: direction from the running balance, multi-line narration, footer skipped', () => {
  const lines = [
    'State Bank of India',
    'Account Statement from 1 Sep 2026 to 30 Sep 2026',
    'Txn Date Value Date Description Ref No./Cheque No. Debit Credit Balance',
    'Opening Balance 12,000.00',
    '01 Sep 2026 01 Sep 2026 TO TRANSFER-UPI/DR/427398765432/UBER INDIA/YESB/uber@ybl/UPI 1,499.00 10,501.00',
    '02 Sep 2026 02 Sep 2026 BY TRANSFER-NEFT*HDFC0000001*N245*ACME CORP 85,000.00 95,501.00',
    'SALARY SEP',
    '03 Sep 2026 03 Sep 2026 ATM WDL ATM CASH 4321 MG ROAD 2,000.00 93,501.00',
    'Page 1 of 2',
    '04 Sep 2026 04 Sep 2026 TO TRANSFER-UPI/DR/427311112222/SWIGGY/HDFC/swiggy@hdfcbank/UPI 455.50 93,045.50',
    'Closing Balance 93,045.50',
  ];
  const rows = linesToRows(lines);
  assert.deepEqual(rows.map(brief), [
    ['2026-09-01', 'expense', 1499],
    ['2026-09-02', 'income', 85000],
    ['2026-09-03', 'expense', 2000],
    ['2026-09-04', 'expense', 455.5],
  ]);
  assert.equal(rows[0].ref, '427398765432');
  assert.equal(cleanNarration(rows[0].description), 'Uber India');
  assert.match(rows[1].description, /SALARY SEP/);
  assert.equal(cleanNarration(rows[2].description), 'ATM withdrawal');
  assert.equal(cleanNarration(rows[3].description), 'Swiggy');
});

test('PDF lines without a balance use Cr/Dr markers (credit card statement)', () => {
  const rows = linesToRows([
    '12/09/2026 NETFLIX.COM MUMBAI 649.00',
    '15/09/2026 PAYMENT RECEIVED - THANK YOU 15,000.00 Cr',
    '18/09/2026 IRCTC WEB 1,180.00 Dr',
  ]);
  assert.deepEqual(rows.map(brief), [['2026-09-12', 'expense', 649], ['2026-09-15', 'income', 15000], ['2026-09-18', 'expense', 1180]]);
});

test('ICICI-style narration names', () => {
  assert.equal(cleanNarration('UPI/427512345678/ZOMATO/zomato@hdfcbank/Pay'), 'Zomato');
  assert.equal(cleanNarration('MMT/IMPS/427566677788/RAHUL SHARMA/HDFC0000123'), 'Rahul Sharma');
  assert.equal(cleanNarration('Int.Pd:01-07-2026 to 30-09-2026'), 'Interest');
});
