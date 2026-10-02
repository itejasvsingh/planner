import { adminAuth } from './firebase';

/** The signed-in user behind `Authorization: Bearer <Firebase ID token>`, with their verified number. */
export async function requestUser(req: Request): Promise<{ uid: string; phone: string } | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const claims = await adminAuth().verifyIdToken(auth.slice(7));
    return typeof claims.phone === 'string' && claims.phone ? { uid: claims.uid, phone: claims.phone } : null;
  } catch {
    return null;
  }
}
