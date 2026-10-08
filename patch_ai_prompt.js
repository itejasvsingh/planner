const fs = require('fs');
let code = fs.readFileSync('app/api/parse/route.ts', 'utf8');

const oldPrompt = `"category": "#Category tag or null"`;
const newPrompt = `"category": "Must be one of: Food Delivery, Cabs, Festival Shopping, Mobile Recharge, Maid/Help, Salary, UPI Transfer, or Other. Null if task."`;

code = code.replace(oldPrompt, newPrompt);

fs.writeFileSync('app/api/parse/route.ts', code);
console.log('Patched AI prompt');
