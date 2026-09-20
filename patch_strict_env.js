const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

const oldBlock = `const DEFAULT_TOKEN = "EAAO6WemhAoABStNb50OD4BgsIdSKjisaiskPHjSVdZACMAdbZAG6PnjUtzFnBDqkZCtRf4VYhzOZA2ZBs0xCSEKJE6gG5vVXpYTxGpvaDv3TkyZBwtZAg6UP0AT5vfwdkbAXuf7J5mi1ATKPyQT4ZCjNqQZBjqYIPVUx4OsIJ8O3qPzIT5yFzlEHlMRft4YS1rzIbGkWIn3ZBZAgmAzCtXpZAOPp9yO0wWZCnoWZAkBN3o";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || "my_align_secure_token_123";
const API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN || process.env.ALIGN_WEBHOOK_SECRET || DEFAULT_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID || "1304237036105269";

// Validate essential webhook credentials at startup
if (!VERIFY_TOKEN) {
    console.error('❌ CRITICAL: Missing required environment variable WHATSAPP_VERIFY_TOKEN or META_VERIFY_TOKEN');
}
if (!API_TOKEN) {
    console.error('❌ CRITICAL: Missing required environment variable WHATSAPP_API_TOKEN or META_ACCESS_TOKEN');
}`;

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

code = code.replace(oldBlock, newBlock);

// Now remove Gemini fallbacks
const FALLBACK_GEMINI = 'AIzaSyCqxW9eSmX0-IX4l6l3hUT3ncZvV6Z99jw';
code = code.replace(new RegExp(` \\|\\| "${FALLBACK_GEMINI}"`, 'g'), '');

fs.writeFileSync(file, code);
