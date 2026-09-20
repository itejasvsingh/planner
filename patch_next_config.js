const fs = require('fs');
const file = 'next.config.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "  experimental: {\n    after: true,\n  },\n",
  ""
);

fs.writeFileSync(file, code);
