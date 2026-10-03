import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Checks a request's shared secret against the given accepted secrets.
 * Accepts `Authorization: Bearer <secret>` (what Vercel Cron sends when CRON_SECRET is set)
 * or the `x-vercel-cron-secret` header. Secrets are never read from the query string.
 * Fails closed: unset/empty secrets never match.
 */
export function hasValidSecret(req: Request, secrets: Array<string | undefined>): boolean {
    const auth = req.headers.get('authorization');
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    const provided = bearer || req.headers.get('x-vercel-cron-secret');
    if (!provided) return false;
    return secrets.some((s) => !!s && safeEqual(provided, s));
}

/** Verifies Meta's `X-Hub-Signature-256` header against the raw request body. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
    if (!appSecret || !header?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    return safeEqual(header.slice(7), expected);
}
