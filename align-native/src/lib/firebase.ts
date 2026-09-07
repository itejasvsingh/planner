import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';

type FirebaseExtra = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const extra = (Constants.expoConfig?.extra?.firebase ?? {}) as FirebaseExtra;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || extra.apiKey || 'AIzaSyDSIN2F2sDc-vB_S7ITCMnKILbr9l-r6co',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || extra.authDomain || 'planner-app-3471f.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || extra.projectId || 'planner-app-3471f',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    extra.storageBucket ||
    'planner-app-3471f.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || extra.messagingSenderId || '817744322906',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID || extra.appId || '1:817744322906:web:35d264cd7079a211749363',
};

function createDb(): Firestore {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch {
    return getFirestore(app);
  }
}

export const db = createDb();
