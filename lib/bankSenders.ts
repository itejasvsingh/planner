/**
 * Indian banks and card issuers whose alert emails Align can read, with the sender domains Gmail's `from:`
 * search should match (current domains plus the RBI-mandated `.bank.in` ones). People pick theirs in
 * Settings → Gmail; only those senders are searched. BANK_DOMAINS (every sender) is mirrored by the Gmail
 * script in align-native/src/lib/gmail-script.ts (tests/gmail-sync.test.cjs checks they match).
 */
export type Bank = { id: string; name: string; senders: string[] };

export const BANKS: Bank[] = [
  { id: 'slice', name: 'slice', senders: ['slice.bank.in', 'sliceit.com'] },
  { id: 'hdfc', name: 'HDFC Bank', senders: ['hdfcbank.net', 'hdfcbank.com', 'hdfcbank.bank.in', 'hdfc.bank.in'] },
  { id: 'icici', name: 'ICICI Bank', senders: ['icicibank.com', 'icicibank.bank.in', 'icici.bank.in'] },
  { id: 'sbi', name: 'State Bank of India', senders: ['sbi.co.in', 'sbi.bank.in'] },
  { id: 'sbicard', name: 'SBI Card', senders: ['sbicard.com'] },
  { id: 'axis', name: 'Axis Bank', senders: ['axisbank.com', 'axisbank.bank.in', 'axis.bank.in'] },
  { id: 'kotak', name: 'Kotak Mahindra Bank', senders: ['kotak.com', 'kotak.bank.in'] },
  { id: 'yes', name: 'YES Bank', senders: ['yesbank.in', 'yesbank.bank.in'] },
  { id: 'idfc', name: 'IDFC FIRST Bank', senders: ['idfcfirstbank.com', 'idfcfirst.bank.in'] },
  { id: 'indusind', name: 'IndusInd Bank', senders: ['indusind.com', 'indusind.bank.in'] },
  { id: 'au', name: 'AU Small Finance Bank', senders: ['aubank.in', 'au.bank.in'] },
  { id: 'federal', name: 'Federal Bank', senders: ['federalbank.co.in', 'federalbank.bank.in'] },
  { id: 'bob', name: 'Bank of Baroda / BOBCARD', senders: ['bankofbaroda.co.in', 'bobcard.co.in', 'bankofbaroda.bank.in'] },
  { id: 'pnb', name: 'Punjab National Bank', senders: ['pnb.co.in', 'pnb.bank.in'] },
  { id: 'canara', name: 'Canara Bank', senders: ['canarabank.com', 'canarabank.bank.in'] },
  { id: 'union', name: 'Union Bank of India', senders: ['unionbankofindia.co.in', 'unionbankofindia.bank.in'] },
  { id: 'boi', name: 'Bank of India', senders: ['bankofindia.co.in', 'bankofindia.bank.in'] },
  { id: 'idbi', name: 'IDBI Bank', senders: ['idbibank.co.in', 'idbi.bank.in'] },
  { id: 'rbl', name: 'RBL Bank', senders: ['rblbank.com', 'rbl.bank.in'] },
  { id: 'bandhan', name: 'Bandhan Bank', senders: ['bandhanbank.com', 'bandhan.bank.in'] },
  { id: 'iob', name: 'Indian Overseas Bank', senders: ['iob.in', 'iob.bank.in'] },
  { id: 'indian', name: 'Indian Bank', senders: ['indianbank.in', 'indianbank.bank.in'] },
  { id: 'sc', name: 'Standard Chartered', senders: ['sc.com'] },
  { id: 'hsbc', name: 'HSBC', senders: ['hsbc.co.in'] },
  { id: 'citi', name: 'Citi', senders: ['citi.com'] },
  { id: 'dbs', name: 'DBS Bank', senders: ['dbs.com'] },
  { id: 'amex', name: 'American Express', senders: ['americanexpress.com'] },
  { id: 'onecard', name: 'OneCard', senders: ['getonecard.app'] },
  { id: 'jupiter', name: 'Jupiter', senders: ['jupiter.money'] },
  { id: 'fi', name: 'Fi', senders: ['fi.money'] },
  { id: 'dcb', name: 'DCB Bank', senders: ['dcbbank.com', 'dcb.bank.in', 'dcbbank.bank.in'] },
  { id: 'otherbankin', name: 'Any other Indian bank (.bank.in address)', senders: ['bank.in'] },
];

/**
 * The bank behind a sender address: a listed bank, or, for any other `<name>.bank.in` address (RBI's
 * domain for Indian banks), one named after its address ("alerts@xyz.bank.in" → id "in_xyz", "XYZ Bank").
 */
export function bankFromSender(from: string): Bank | null {
  const f = String(from || '').toLowerCase().trim();
  const listed = BANKS.find((b) => b.id !== 'otherbankin' && b.senders.some((s) => f === s || f.endsWith(`@${s}`) || f.endsWith(`.${s}`)));
  if (listed) return listed;
  const m = f.match(/(?:@|\.)([a-z0-9-]+)\.bank\.in$/);
  return m ? { id: `in_${m[1]}`, name: bankInName(m[1]), senders: [`${m[1]}.bank.in`] } : null;
}

/** "xyz" → "XYZ Bank", "karurvysya" → "Karurvysya Bank", "kvbank" → "KV Bank". */
function bankInName(label: string) {
  const core = label.replace(/-?bank$/, '') || label;
  return `${core.length <= 4 ? core.toUpperCase() : core[0].toUpperCase() + core.slice(1)} Bank`;
}

/** A bank's display name by id, including `.bank.in` ones found by address. */
export function bankNameById(id: string): string {
  const listed = BANKS.find((b) => b.id === id);
  if (listed) return listed.name;
  return id.startsWith('in_') ? bankInName(id.slice(3)) : id;
}

export const BANK_DOMAINS = [...new Set(BANKS.flatMap((b) => b.senders))];

const EXTRA_SENDER = /^(?:[a-z0-9._%+-]+@)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/** A sender someone typed for a bank Align doesn't list: an address or a domain, lower-case. */
export function normalizeSender(raw: string): string | null {
  const s = String(raw || '').trim().toLowerCase().replace(/^mailto:/, '').replace(/[<>]/g, '');
  return s.length <= 80 && EXTRA_SENDER.test(s) ? s : null;
}

/** Senders to search for someone: their chosen banks (all, until they choose) plus any they added. */
export function sendersFor(banks: string[] | null | undefined, extra: string[] | null | undefined): string[] {
  const chosen = banks && banks.length ? BANKS.filter((b) => banks.includes(b.id)).flatMap((b) => b.senders) : BANK_DOMAINS;
  return [...new Set([...chosen, ...(extra || [])])];
}
