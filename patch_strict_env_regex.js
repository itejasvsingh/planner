const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /const VERIFY_TOKEN[\s\S]*?console\.error\('.*?PHONE_NUMBER_ID'\);\n\}/m;

const newBlock = `const API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;
if (!API_TOKEN) {
  console.error("FATAL: WHATSAPP_API_TOKEN or META_ACCESS_TOKEN env var is not set");
}
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;
if (!VERIFY_TOKEN) {
  console.error("FATAL: WHATSAPP_VERIFY_TOKEN env var is not set");
}
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;
if (!PHONE_ID) {
  console.error("FATAL: WHATSAPP_PHONE_ID or PHONE_NUMBER_ID env var is not set");
}`;

code = code.replace(regex, newBlock);

fs.writeFileSync(file, code);
