const fs = require('fs');
const file = 'lib/dailySummary.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /const DEFAULT_TOKEN = ".*?";\nconst API_TOKEN = .*?;\nconst PHONE_ID = .*?;/m;

const newBlock = `const API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;

if (!API_TOKEN) console.error("FATAL: WHATSAPP_API_TOKEN or META_ACCESS_TOKEN is missing in dailySummary");
if (!PHONE_ID) console.error("FATAL: WHATSAPP_PHONE_ID or PHONE_NUMBER_ID is missing in dailySummary");`;

code = code.replace(regex, newBlock);
fs.writeFileSync(file, code);
