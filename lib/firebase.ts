import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    // Add your other config variables here if you have them (storageBucket, etc.)
};

// Initialize Firebase using the Compat layer
const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();
const db = app.firestore();

// Enable offline caching
if (typeof window !== 'undefined') {
    db.enablePersistence().catch((err) => {
        console.error("Firebase persistence error:", err);
    });
}

export { app, db, firebase };