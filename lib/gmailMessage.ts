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

export function messageText(msg: GmailMessage): { subject: string; text: string } {
  const subject = msg.payload?.headers?.find((h) => h.name.toLowerCase() === 'subject')?.value || '';
  const out = { plain: [] as string[], html: [] as string[] };
  collect(msg.payload, out);
  const body = out.plain.join('\n').trim() || htmlToText(out.html.join('\n'));
  return { subject, text: `${subject}\n${body}`.slice(0, 8000) };
}

// Words every transaction alert contains; leaves out offers and newsletters, which would use up the quota.
const ALERT_WORDS = '{debited credited spent debit credit transaction txn withdrawn paid received}';

/** Gmail search for transaction alerts from the given sender domains in a time window (Unix seconds). */
export function bankQuery(domains: string[], window: { after: number; before?: number }) {
  const before = window.before ? ` before:${Math.ceil(window.before)}` : '';
  return `from:(${domains.join(' OR ')}) ${ALERT_WORDS} after:${Math.floor(window.after)}${before} -in:spam -in:trash`;
}
