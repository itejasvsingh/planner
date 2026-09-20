const fs = require('fs');
const file = 'align-native/src/lib/firebase.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,/g,
  'apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDSIN2F2sDc-vB_S7ITCMnKILbr9l-r6co",'
);
code = code.replace(
  /authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,/g,
  'authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "planner-app-3471f.firebaseapp.com",'
);
code = code.replace(
  /projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,/g,
  'projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "planner-app-3471f",'
);
code = code.replace(
  /storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,/g,
  'storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "planner-app-3471f.firebasestorage.app",'
);
code = code.replace(
  /messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,/g,
  'messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "817744322906",'
);
code = code.replace(
  /appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,/g,
  'appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:817744322906:web:35d264cd7079a211749363",'
);

code = code.replace(
  /if \(!firebaseConfig\.apiKey\) {[\s\S]*?}/,
  '// Soft fallback gracefully\nif (!firebaseConfig.apiKey) { console.warn("Missing Firebase configuration."); }'
);

fs.writeFileSync(file, code);
