const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  "                } catch (procErr) {\n                    console.error(\"❌ Background processing error:\", procErr);\n                }\n            });",
  "            } catch (procErr) {\n                console.error(\"❌ Background processing error:\", procErr);\n            }"
);

// also remove my debug log
code = code.replace("console.log('API_TOKEN', API_TOKEN ? 'exists' : 'missing', 'PHONE_ID', PHONE_ID ? 'exists' : 'missing');\n", "");

fs.writeFileSync(file, code);
