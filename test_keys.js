const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "if (message) {",
  "if (message) {\nconsole.log('API_TOKEN', API_TOKEN ? 'exists' : 'missing', 'PHONE_ID', PHONE_ID ? 'exists' : 'missing');"
);

fs.writeFileSync(file, code);
