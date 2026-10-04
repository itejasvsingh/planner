/**
 * Plain text of a Gmail API message (format=full): the subject plus the text/plain part, or the HTML part
 * turned into text. Pure (no imports) so tests can load it directly (tests/gmail-sync.test.cjs).
 */

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
export type GmailMessage = { id: string; internalDate?: string; payload?: Part };

function decode(data?: string) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

export function htmlToText(html: string) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8377;|&#x20b9;/gi, '₹')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function collect(part: Part | undefined, out: { plain: string[]; html: string[] }) {
  if (!part) return;
  if (part.filename) return; // attachments (statements) are handled separately
  if (part.mimeType === 'text/plain' && part.body?.data) out.plain.push(decode(part.body.data));
  else if (part.mimeType === 'text/html' && part.body?.data) out.html.push(decode(part.body.data));
  for (const p of part.parts || []) collect(p, out);
}

export function messageText(msg: GmailMessage): { subject: string; text: string; from: string } {
  const header = (name: string) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value || '';
  const subject = header('subject');
  const from = (header('from').match(/<([^>]+)>/)?.[1] || header('from')).trim().toLowerCase();
  const out = { plain: [] as string[], html: [] as string[] };
  collect(msg.payload, out);
  const body = out.plain.join('\n').trim() || htmlToText(out.html.join('\n'));
  return { subject, text: `${subject}\n${body}`.slice(0, 8000), from };
}

// Words every transaction alert contains; leaves out offers and newsletters, which would use up the quota.
const ALERT_WORDS = '{debited credited spent debit credit transaction txn withdrawn paid received}';

/** Gmail search for transaction alerts from the given sender domains in a time window (Unix seconds). */
export function bankQuery(domains: string[], window: { after: number; before?: number }) {
  const before = window.before ? ` before:${Math.ceil(window.before)}` : '';
  return `from:(${domains.join(' OR ')}) ${ALERT_WORDS} after:${Math.floor(window.after)}${before} -in:spam -in:trash`;
}

/** Gmail search for card bill / statement emails from the given senders since `afterSec`. */
export function billQuery(domains: string[], afterSec: number) {
  return `from:(${domains.join(' OR ')}) {statement bill "amount due" "due date"} after:${Math.floor(afterSec)} -in:spam -in:trash`;
}

/** PDF attachments of a message (statements): inline data when Gmail included it, else an attachment id. */
export function pdfAttachments(msg: GmailMessage): { filename: string; attachmentId?: string; data?: string; size: number }[] {
  const out: { filename: string; attachmentId?: string; data?: string; size: number }[] = [];
  const walk = (p?: Part) => {
    if (!p) return;
    if (p.filename && (/\.pdf$/i.test(p.filename) || p.mimeType === 'application/pdf') && (p.body?.attachmentId || p.body?.data)) {
      out.push({ filename: p.filename, attachmentId: p.body.attachmentId, data: p.body.data, size: p.body.size || 0 });
    }
    for (const c of p.parts || []) walk(c);
  };
  walk(msg.payload);
  return out;
}

/** Statement emails with a PDF from these senders since `afterSec`. */
export function statementPdfQuery(domains: string[], afterSec: number) {
  return `from:(${domains.join(' OR ')}) has:attachment filename:pdf {statement estatement "e-statement"} after:${Math.floor(afterSec)} -in:spam -in:trash`;
}
