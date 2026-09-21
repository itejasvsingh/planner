const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
(async () => {
    const snap = await db.collection('webhook_processed').limit(5).get();
    snap.forEach(doc => console.log(doc.id, doc.data()));
})();
