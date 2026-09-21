const fs = require('fs');
const file = 'app/api/webhook/route.ts';
let code = fs.readFileSync(file, 'utf8');

const tsCode = `
        const messageId = message.id;
        const msgTimestamp = parseInt(message.timestamp || '0', 10);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        
        // Ignore messages older than 5 minutes (300 seconds) to flush Meta's retry backlog
        if (msgTimestamp > 0 && currentTimestamp - msgTimestamp > 300) {
            console.log('⏳ Ignored old message from Meta retry backlog:', messageId);
            return NextResponse.json({ status: 'ignored_old' }, { status: 200 });
        }

        if (messageId) {
`;

code = code.replace(
    'const messageId = message.id;\n        if (messageId) {',
    tsCode
);

fs.writeFileSync(file, code);
console.log("Timestamp filter added.");
