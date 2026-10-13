/**
 * The bot remembers its last reply and item only for follow-ups ("make it 9am"). Kept longer, it told people
 * "I've already set that" for things they had since deleted in the app, so memory expires.
 */
export const SESSION_TTL_MS = 30 * 60 * 1000;

export function freshSession<T extends { updatedAt?: string } | null | undefined>(session: T, nowMs: number): T | null {
  if (!session) return null;
  const at = Date.parse(session.updatedAt || '');
  return Number.isFinite(at) && nowMs - at <= SESSION_TTL_MS ? session : null;
}
