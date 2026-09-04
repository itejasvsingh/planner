import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDSIN2F2sDc-vB_S7ITCMnKILbr9l-r6co",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "planner-app-3471f.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "planner-app-3471f",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "planner-app-3471f.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "817744322906",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:817744322906:web:35d264cd7079a211749363"
};

const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();
const db = app.firestore();

if (typeof window !== 'undefined') {
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open simultaneously, fallback to single tab persistence
      db.enablePersistence().catch((fallbackErr) => {
        console.warn("Firestore single-tab persistence fallback failed:", fallbackErr);
      });
    } else if (err.code === 'unimplemented') {
      console.warn("Current browser does not support Firestore offline persistence");
    } else {
      console.warn("Firebase persistence error:", err.code, err.message);
    }
  });
}

export { app, db, firebase };