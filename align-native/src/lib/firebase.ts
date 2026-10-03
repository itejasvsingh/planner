import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, initializeAuth, onAuthStateChanged, type Auth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDSIN2F2sDc-vB_S7ITCMnKILbr9l-r6co",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "planner-app-3471f.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "planner-app-3471f",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "planner-app-3471f.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "817744322906",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:817744322906:web:35d264cd7079a211749363",
};

// Soft fallback gracefully
if (!firebaseConfig.apiKey) { console.warn("Missing Firebase configuration."); }

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function createDb(): Firestore {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch {
    return getFirestore(app);
  }
}

function createAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const db = createDb();
export const auth = createAuth();

// Local test runs only (tests/e2e): EXPO_PUBLIC_FIREBASE_EMULATOR=<host> points the app at the Firebase
// emulators. Release builds never set it.
const EMULATOR = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR;
if (EMULATOR) {
  connectAuthEmulator(auth, `http://${EMULATOR}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR, 8080);
}


/**
 * Runs `start` once a signed-in user is restored (straight away if there is one) and returns a stop function
 * that also stops whatever `start` returned. The app opens before Firebase restores the session (see
 * phone-context), and Firestore refuses requests until then.
 */
export function whenSignedIn(start: () => (() => void) | void): () => void {
  let stop: (() => void) | void | null = null;
  if (auth.currentUser) {
    stop = start();
    return () => { if (stop) stop(); };
  }
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!user || stop !== null) return;
    unsubscribe();
    stop = start() || undefined;
  });
  return () => {
    unsubscribe();
    if (stop) stop();
  };
}
