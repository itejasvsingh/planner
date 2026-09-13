import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

let _app: firebase.app.App | null = null;
let _db: firebase.firestore.Firestore | null = null;

function getApp(): firebase.app.App {
  if (!_app) {
    if (!firebase.apps.length) {
      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        throw new Error("Missing required Firebase configuration. Ensure NEXT_PUBLIC_FIREBASE_API_KEY and NEXT_PUBLIC_FIREBASE_PROJECT_ID are set.");
      }
      _app = firebase.initializeApp(firebaseConfig);
    } else {
      _app = firebase.app();
    }
  }
  return _app;
}

function getDb(): firebase.firestore.Firestore {
  if (!_db) {
    _db = getApp().firestore();
    if (typeof window !== 'undefined') {
      try {
        _db.enablePersistence({ synchronizeTabs: true }).catch((err: any) => {
          if (err.code === 'failed-precondition') {
            _db?.enablePersistence().catch(() => {});
          } else {
            console.warn("Firebase persistence notice:", err.code, err.message);
          }
        });
      } catch (e) {
        console.warn("Firestore persistence init error:", e);
      }
    }
  }
  return _db;
}

const db = new Proxy({} as firebase.firestore.Firestore, {
  get(_target, prop) {
    const firestore = getDb();
    const val = (firestore as any)[prop];
    return typeof val === 'function' ? val.bind(firestore) : val;
  },
});

const app = new Proxy({} as firebase.app.App, {
  get(_target, prop) {
    const instance = getApp();
    const val = (instance as any)[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  },
});

export { app, db, firebase, getApp, getDb };