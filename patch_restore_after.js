const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

// Add import
code = code.replace(
  "import { NextResponse } from 'next/server';",
  "import { NextResponse, after } from 'next/server';"
);

// Restore after()
code = code.replace(
  "            try {\n                // ROUTE A: Handle Images (Receipts)",
  "            after(async () => {\n                try {\n                    // ROUTE A: Handle Images (Receipts)"
);

code = code.replace(
  "            } catch (procErr) {\n                console.error(\"❌ Background processing error:\", procErr);\n            }",
  "                } catch (procErr) {\n                    console.error(\"❌ Background processing error:\", procErr);\n                }\n            });"
);

fs.writeFileSync(file, code);
