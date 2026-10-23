import type { CardSummary } from '@/lib/gmail-connect';

export const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;
export const shortDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const cardTitle = (c: Pick<CardSummary, 'issuerName' | 'last4'>) => `${c.issuerName}${c.last4 ? ` ••${c.last4}` : ''}`;

/** "Due 12 Oct · in 8 days", "Overdue by 2 days", "Paid · was due 20 Sept", "No due date". */
export function dueText(card: CardSummary): string {
  if (!card.dueDate || card.daysLeft === null) return card.status === 'paid' ? 'Paid' : 'No due date';
  const d = shortDay(card.dueDate);
  if (card.status === 'paid') return `Paid · was due ${d}`;
  if (card.status === 'overdue') return `Overdue by ${-card.daysLeft} day${card.daysLeft === -1 ? '' : 's'} · was due ${d}`;
  if (card.daysLeft === 0) return `Due today · ${d}`;
  return `Due ${d} · in ${card.daysLeft} day${card.daysLeft === 1 ? '' : 's'}`;
}

export function detailsText(card: CardSummary): string {
  return [
    card.totalDue ? `Statement ${inr(card.totalDue)}` : '',
    card.minDue ? `min ${inr(card.minDue)}` : '',
    card.paidSince ? `paid ${inr(card.paidSince)}` : '',
    card.spentSince ? `spent since ${inr(card.spentSince)}` : '',
  ].filter(Boolean).join(' · ');
}

/** About when the next statement lands: a month after the last one ("about 10 Nov"), null when unknown. */
export function nextStatement(statementDate: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(statementDate || '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const last = new Date(y, mo + 2, 0).getDate(); // days in the next month: a 31st statement lands on the 30th/28th
  const next = new Date(y, mo + 1, Math.min(d, last), 12);
  return next.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * The numbers for a card's summary row. Billed = what's left of the last statement (0 once paid), Unbilled = spent
 * since, Outstanding = both. Limit and Left only when the user has entered a limit.
 */
export function cardNumbers(card: Pick<CardSummary, 'outstanding' | 'spentSince' | 'limit'>) {
  const unbilled = card.spentSince || 0;
  const outstanding = card.outstanding || 0;
  const billed = Math.max(0, outstanding - unbilled);
  const limit = card.limit && card.limit > 0 ? card.limit : null;
  return { limit, billed, unbilled, outstanding, left: limit === null ? null : Math.max(0, limit - outstanding) };
}

/**
 * The one-line strip under a card in the list: red when the due date has passed, grey with the date while it's coming,
 * "Awaiting statement" when there's nothing yet. None once it's paid.
 */
export function cardStrip(card: Pick<CardSummary, 'status' | 'daysLeft' | 'dueDate' | 'outstanding' | 'hidden'>): { tone: 'overdue' | 'due' | 'awaiting'; text: string } | null {
  if (card.hidden || card.status === 'paid') return null;
  if (!card.dueDate || card.daysLeft === null) return { tone: 'awaiting', text: card.outstanding > 0 ? `Awaiting statement · about ${inr(card.outstanding)} so far` : 'Awaiting statement' };
  const amount = inr(card.outstanding);
  if (card.status === 'overdue') {
    const n = -card.daysLeft;
    return { tone: 'overdue', text: `${amount} due ${n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'} ago`}` };
  }
  // Within a week: how many days, so it reads at a glance; further out: the date
  const when = card.daysLeft === 0 ? 'today' : card.daysLeft === 1 ? 'tomorrow' : card.daysLeft <= 7 ? `in ${card.daysLeft} days (${shortDay(card.dueDate)})` : `on ${shortDay(card.dueDate)}`;
  return { tone: 'due', text: `${amount} due ${when}` };
}
