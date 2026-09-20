const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace the after() wrapper with direct await
code = code.replace(
  "            // Dispatch in background via Next.js after() to immediately return 200 OK to Meta\n            after(async () => {\n                try {\n                    // ROUTE A: Handle Images (Receipts)",
  "            try {\n                // ROUTE A: Handle Images (Receipts)"
);

code = code.replace(
  "                } catch (err) {\n                    console.error('Webhook dispatch error:', err);\n                }\n            });",
  "            } catch (err) {\n                console.error('Webhook processing error:', err);\n            }"
);

fs.writeFileSync(file, code);
