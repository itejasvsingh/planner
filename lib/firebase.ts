import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDSIN2F2sDc-vB_S7ITCMnKILbr9l-r6co",
    authDomain: "planner-app-3471f.firebaseapp.com",
    projectId: "planner-app-3471f",
    storageBucket: "planner-app-3471f.firebasestorage.app",
    messagingSenderId: "817744322906",
    appId: "1:817744322906:web:35d264cd7079a211749363"
};

// Prevent Next.js from initializing Firebase multiple times during hot-reloads
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// Enable offline persistence (only run this in the browser, not on the server)
if (typeof window !== 'undefined') {
    db.enablePersistence({ synchronizeTabs: true }).catch(error => {
        console.warn('Offline persistence unavailable:', error.code);
    });
}

export { db };