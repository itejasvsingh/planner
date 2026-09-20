const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

const FALLBACK_GEMINI = 'AIzaSyCqxW9eSmX0-IX4l6l3hUT3ncZvV6Z99jw';

code = code.replace(
  /const GEMINI_API_KEY = process\.env\.GEMINI_API_KEY \|\| process\.env\.GOOGLE_API_KEY \|\| process\.env\.GOOGLE_GENAI_API_KEY;/g,
  `const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || "${FALLBACK_GEMINI}";`
);

fs.writeFileSync(file, code);
