const fs = require('fs');
const file = 'lib/dailySummary.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "const API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;",
  'const DEFAULT_TOKEN = "EAAO6WemhAoABSdMEF3np2uZB0fWZA8SHpv0dX0Nq0fjg0S5KZCj3td0amntX6vvDVzWguTYwZBSgYDCYkORiJpJXtm9mggjMkrmTLvZBCQLwlIfIOsWvKLTxKFBfjKoXAyBlAZArHkH7gHnrfYXYTgkxVe8t4AVNYZBzAE5WHZAGEKaVZAYtC0ep46QTZCSEZAcgwZDZD";\nconst API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN || DEFAULT_TOKEN;'
);

code = code.replace(
  "const PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;",
  'const PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID || "1304237036105269";'
);

fs.writeFileSync(file, code);
