import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// We are using the exact hardcoded keys from your old index.html
const firebaseConfig = {
    apiKey: "AIzaSyDSIN2F2sDc-vB_S7ITCMnKILbr9l-r6co",
    authDomain: "planner-app-3471f.firebaseapp.com",
    projectId: "planner-app-3471f",
    storageBucket: "planner-app-3471f.firebasestorage.app",
    messagingSenderId: "817744322906",
    appId: "1:817744322906:web:35d264cd7079a211749363"
};

const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();
const db = app.firestore();

if (typeof window !== 'undefined') {
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.error("Firebase persistence error:", err.code, err.message);
  });
}

export { app, db, firebase };