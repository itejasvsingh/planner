const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /const PHONE_ID = process\.env\.WHATSAPP_PHONE_ID \|\| process\.env\.PHONE_NUMBER_ID;/g,
  'const PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID || "1304237036105269";'
);

fs.writeFileSync(file, code);
