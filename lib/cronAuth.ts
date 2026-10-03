import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * True when a request carries CRON_SECRET. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`;
 * manual runs may use the `x-vercel-cron-secret` header or `?secret=`. Never true when CRON_SECRET is unset.
 */
export function hasCronSecret(req: Request, secret = process.env.CRON_SECRET): boolean {
  const expected = (secret || '').trim();
  if (!expected) return false;
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const given = [bearer, req.headers.get('x-vercel-cron-secret') || '', new URL(req.url).searchParams.get('secret') || ''];
  return given.some((g) => g.trim() !== '' && timingSafeEqual(digest(g.trim()), digest(expected)));
}
