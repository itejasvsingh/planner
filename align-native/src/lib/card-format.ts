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
