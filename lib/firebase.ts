import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Server-side Firebase through the Admin SDK. Admin access is not subject to Firestore rules, so the rules can
 * keep phones and browsers to their own data while API routes, crons and the WhatsApp bot work as before.
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT, the service-account key JSON (raw or base64). Against the local
 * emulators (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST) none are needed.
 */
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'planner-app-3471f';

function serviceAccount(): (ServiceAccount & { project_id?: string }) | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
}

let _app: App | null = null;

export function getApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length) return (_app = existing[0]);
  const sa = serviceAccount();
  if (!sa && !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not set. Add the Firebase service-account key to the environment.');
  }
  _app = initializeApp(sa ? { credential: cert(sa), projectId: sa.project_id || PROJECT_ID } : { projectId: PROJECT_ID });
  return _app;
}

let _db: Firestore | null = null;

export function getDb(): Firestore {
  if (!_db) _db = getFirestore(getApp());
  return _db;
}

export function adminAuth(): Auth {
  return getAuth(getApp());
}

// Created on first use, so importing this module (e.g. during `next build`) needs no credentials.
const db = new Proxy({} as Firestore, {
  get(_target, prop) {
    const firestore = getDb();
    const val = (firestore as any)[prop];
    return typeof val === 'function' ? val.bind(firestore) : val;
  },
});

export { db, FieldValue };
