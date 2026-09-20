const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "const sessionRef = db.collection('user_sessions').doc(senderPhone);",
  "console.log('Fetching session for', senderPhone);\nconst sessionRef = db.collection('user_sessions').doc(senderPhone);"
);

code = code.replace(
  "const sessionSnap = await sessionRef.get().catch(() => null);",
  "const sessionSnap = await sessionRef.get().catch((err) => { console.error('DB Error:', err); return null; });\nconsole.log('Session fetched:', !!sessionSnap);"
);

code = code.replace(
  "const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;",
  "console.log('Gemini Key length:', GEMINI_API_KEY ? GEMINI_API_KEY.length : 0);\nconst genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;"
);

fs.writeFileSync(file, code);
