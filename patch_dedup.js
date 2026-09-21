const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

const dedupCode = `
        const messageId = message.id;
        if (messageId) {
            const dedupRef = db.collection('webhook_processed').doc(messageId);
            const dedupSnap = await dedupRef.get();
            if (dedupSnap.exists) {
                console.log('🔄 Ignored duplicate webhook message ID:', messageId);
                return NextResponse.json({ status: 'duplicate' }, { status: 200 });
            }
            // Mark as processing immediately to prevent race conditions from aggressive retries
            await dedupRef.set({ processedAt: new Date().toISOString() });
        }
`;

code = code.replace(
    'const senderPhone = message.from; // e.g., "918130595547"',
    'const senderPhone = message.from; // e.g., "918130595547"\n' + dedupCode
);

fs.writeFileSync(file, code);
console.log("Deduplication added.");
