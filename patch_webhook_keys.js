const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;",
  'const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || "my_align_secure_token_123";'
);

code = code.replace(
  "const API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;",
  'const DEFAULT_TOKEN = "EAAO6WemhAoABSdMEF3np2uZB0fWZA8SHpv0dX0Nq0fjg0S5KZCj3td0amntX6vvDVzWguTYwZBSgYDCYkORiJpJXtm9mggjMkrmTLvZBCQLwlIfIOsWvKLTxKFBfjKoXAyBlAZArHkH7gHnrfYXYTgkxVe8t4AVNYZBzAE5WHZAGEKaVZAYtC0ep46QTZCSEZAcgwZDZD";\nconst API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN || process.env.ALIGN_WEBHOOK_SECRET || DEFAULT_TOKEN;'
);

fs.writeFileSync(file, code);
