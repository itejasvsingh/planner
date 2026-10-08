const fs = require('fs');
let code = fs.readFileSync('app/api/webhook/route.ts', 'utf8');

const oldReceiptPrompt = `Categorize the spend into one of these tags if possible: #Dining, #Travel, #Academics, #General.`;
const newReceiptPrompt = `Categorize the spend into one of these exact tags if possible: Food Delivery, Cabs, Festival Shopping, Mobile Recharge, Maid/Help, UPI Transfer, Salary, or Other. Do not use hashtags.`;
code = code.replace(oldReceiptPrompt, newReceiptPrompt);

const oldReceiptFormat = `"category": "#Dining"`;
const newReceiptFormat = `"category": "Food Delivery"`;
code = code.replace(oldReceiptFormat, newReceiptFormat);

const oldTextFormat = `"category": "#Category tag or null"`;
const newTextFormat = `"category": "One of: Food Delivery, Cabs, Festival Shopping, Mobile Recharge, Maid/Help, UPI Transfer, Salary, or Other"`;
code = code.replace(oldTextFormat, newTextFormat);

const oldAudioExpense = `"category": "#Dining" | "#Travel" | "#Academics" | "#General"`;
const newAudioExpense = `"category": "Food Delivery" | "Cabs" | "Festival Shopping" | "Mobile Recharge" | "Maid/Help" | "UPI Transfer" | "Salary" | "Other"`;
code = code.replace(oldAudioExpense, newAudioExpense);

fs.writeFileSync('app/api/webhook/route.ts', code);
console.log('Patched webhook prompts');
