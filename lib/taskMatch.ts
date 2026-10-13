/** Same task sent again: the same day and mostly the same words, even if the AI worded the title differently. */
const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2));

export function sameTask(a: { title: string; dueDate: string }, b: { title: string; dueDate: string }): boolean {
  if (a.dueDate !== b.dueDate) return false;
  const wa = words(a.title);
  const wb = words(b.title);
  if (!wa.size || !wb.size) return a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
  let common = 0;
  for (const w of wa) if (wb.has(w)) common += 1;
  return common / Math.min(wa.size, wb.size) >= 0.6;
}
