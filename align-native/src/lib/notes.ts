import type { PlannerItem } from '@/lib/planner-item';

/** Notes are planner items of type 'note': a title (optional), a body, and a pin. */
export const isNote = (i: PlannerItem) => i.type === 'note';

/** The note's heading: its title, else the first line of the body. */
export function noteHeading(n: Pick<PlannerItem, 'title' | 'body'>): string {
  const title = (n.title || '').trim();
  if (title) return title;
  return (n.body || '').trim().split('\n')[0].trim() || 'Untitled note';
}

/** A few lines of the body for the list (skipping the line used as the heading). */
export function notePreview(n: Pick<PlannerItem, 'title' | 'body'>): string {
  const lines = (n.body || '').trim().split('\n').map(l => l.trim()).filter(Boolean);
  return ((n.title || '').trim() ? lines : lines.slice(1)).join('\n');
}

const editedAt = (n: PlannerItem) => n.updatedAt || (typeof n.createdAt === 'string' ? n.createdAt : '') || '';

/** Pinned first, then most recently edited. */
export function sortNotes(notes: PlannerItem[]): PlannerItem[] {
  return [...notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || editedAt(b).localeCompare(editedAt(a)));
}

/** Notes whose title or text contains every word typed. */
export function searchNotes(notes: PlannerItem[], query: string): PlannerItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return notes;
  return notes.filter(n => {
    const text = `${n.title || ''}\n${n.body || ''}`.toLowerCase();
    return words.every(w => text.includes(w));
  });
}

/** "Just now", "5 min ago", "2:30 PM", "Yesterday", "12 Sep". */
export function editedLabel(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
