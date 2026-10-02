/**
 * Email domains of Indian banks and card issuers, for reading alert emails. Mirrors BANK_DOMAINS in
 * align-native/src/lib/gmail-script.ts (tests/gmail-sync.test.cjs checks they match).
 */
export const BANK_DOMAINS = [
  'hdfcbank.net', 'hdfcbank.com', 'icicibank.com', 'axisbank.com', 'sbi.co.in', 'sbicard.com', 'kotak.com',
  'yesbank.in', 'idfcfirstbank.com', 'indusind.com', 'aubank.in', 'federalbank.co.in', 'bankofbaroda.co.in',
  'bobcard.co.in', 'pnb.co.in', 'canarabank.com', 'unionbankofindia.co.in', 'rblbank.com', 'sc.com',
  'hsbc.co.in', 'americanexpress.com', 'getonecard.app', 'idbibank.co.in', 'bandhanbank.com', 'iob.in',
  'indianbank.in', 'dbs.com', 'citi.com',
  // slice (card and savings account)
  'sliceit.com', 'slice.bank.in',
  // RBI moved Indian banks to .bank.in addresses; Gmail's from:bank.in matches any of them
  'bank.in',
];
