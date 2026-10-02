import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for secrets kept in Firestore (Gmail access keys). The key is GMAIL_TOKEN_KEY: 32 random bytes,
 * base64 (`openssl rand -base64 32`). Output: "v1.<iv>.<tag>.<ciphertext>", all base64url.
 */
function key(): Buffer {
  const raw = process.env.GMAIL_TOKEN_KEY || '';
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('GMAIL_TOKEN_KEY must be 32 bytes, base64 (openssl rand -base64 32).');
  return k;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), enc].map((x) => (typeof x === 'string' ? x : x.toString('base64url'))).join('.');
}

export function open(sealed: string): string {
  const [v, iv, tag, enc] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Unrecognised sealed value');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}
