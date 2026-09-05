import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../../../lib/firebase';

export const dynamic = 'force-dynamic';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const API_TOKEN = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;

// ==========================================
// 1. WEBHOOK VERIFICATION (Required by Meta)
// ==========================================
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully!');
        // Force a raw plain-text response
        return new Response(challenge, { 
            status: 200, 
            headers: { 'Content-Type': 'text/plain' } 
        });
    }

    return new Response('Invalid token', { status: 403 });
}

// ==========================================
// 2. INCOMING MESSAGE HANDLER
// ==========================================
export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Ensure this is a WhatsApp status update/message
        if (body.object !== 'whatsapp_business_account') {
            return NextResponse.json({ status: 'ignored' }, { status: 404 });
        }

        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0]?.value;
        const message = changes?.messages?.[0];

        // If it's a valid message (not just a read receipt)
        if (message) {
            const senderPhone = message.from; // e.g., "918130595547"
            
            // ROUTE A: Handle Images (Receipts)
            if (message.type === 'image') {
                const imageId = message.image.id;
                console.log(`📸 Image received from ${senderPhone}. ID: ${imageId} (Phone ID: ${PHONE_ID || 'default'})`);
                
                // Trigger the background download and AI processing
                // We don't await this so we can immediately return 200 OK to Meta
                processReceiptImage(imageId, senderPhone).catch(console.error);
            } 
            // ROUTE B: Handle Text
            else if (message.type === 'text') {
                const textBody = message.text.body;
                console.log(`💬 Text from ${senderPhone}: ${textBody}`);
                
                // Process text asynchronously so we return 200 OK to Meta immediately
                processTextQuery(textBody, senderPhone).catch(console.error);
            }
        }

        // Meta REQUIRES a 200 OK within 3 seconds, or they will retry and eventually block you
        return NextResponse.json({ status: 'success' }, { status: 200 });

    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ==========================================
// SMART VENDOR AUTO-TAGGING
// ==========================================
function applySmartTags(vendorName: string, aiGuessedCategory?: string): string {
    if (!vendorName) return aiGuessedCategory || '#General';
    const name = vendorName.toLowerCase();

    // 🍔 Dining & Delivery
    if (/(swiggy|zomato|bhatinda xpress|bakingo|domino|pizza|starbucks|mcdonalds)/i.test(name)) {
        return '#Dining';
    }
    
    // ✈️ Transit & Travel
    if (/(irctc|indigo|uber|ola|rapido|redbus|makemytrip)/i.test(name)) {
        return '#Travel';
    }

    // 📚 Academics & Subscriptions (Add your own as needed!)
    if (/(coursera|udemy|spotify|netflix|aws|github)/i.test(name)) {
        return '#Academics'; // or #Subscriptions
    }

    // 📦 E-commerce / General
    if (/(amazon|flipkart|myntra|blinkit|zepto)/i.test(name)) {
        return '#General';
    }

    // Fallback to what the AI guessed if no hardcoded rules match
    return aiGuessedCategory || '#General';
}

// ==========================================
// WHATSAPP OUTBOUND MESSAGE SENDER
// ==========================================
async function sendWhatsAppTextMessage(to: string, text: string) {
    const activePhoneId = PHONE_ID || process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;
    if (!activePhoneId) {
        console.error("❌ Missing WhatsApp Phone ID (WHATSAPP_PHONE_ID / PHONE_ID not set)");
        return;
    }
    const token = API_TOKEN || process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!token) {
        console.error("❌ Missing Meta API Token (WHATSAPP_API_TOKEN / API_TOKEN / META_ACCESS_TOKEN not set)");
        return;
    }

    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${activePhoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: text }
            })
        });

        if (!res.ok) {
            const errBody = await res.text();
            console.error(`❌ Meta WhatsApp API Error (${res.status}):`, errBody);
        } else {
            console.log(`✅ WhatsApp message delivered to ${to}`);
        }
    } catch (err: any) {
        console.error("❌ Network error sending WhatsApp message:", err.message);
    }
}

// ==========================================
// 3. META API MEDIA DOWNLOADER & AI PARSER
// ==========================================
async function processReceiptImage(imageId: string, senderPhone: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Missing Gemini API Token");

    // 1. Ask Meta for the secure download URL
    const metaUrlReq = await fetch(`https://graph.facebook.com/v17.0/${imageId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    
    if (!metaUrlReq.ok) throw new Error("Failed to get image URL from Meta");
    const { url: downloadUrl } = await metaUrlReq.json();

    // 2. Download the actual image binary data using that URL
    const imageReq = await fetch(downloadUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });

    if (!imageReq.ok) throw new Error("Failed to download image binary");
    
    // 3. Convert the image to Base64 for Gemini
    const arrayBuffer = await imageReq.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    const base64Image = imageBuffer.toString('base64');

    console.log("✅ Image downloaded! Analyzing with Gemini...");

    // 4. Send to Gemini 1.5 Flash
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a financial extraction assistant. Analyze this receipt image and extract the vendor name and total amount.
    Categorize the spend into one of these tags if possible: #Dining, #Travel, #Academics, #General. If none fit perfectly, create a relevant short tag starting with #.
    Respond ONLY with a valid, raw JSON object. Do not include markdown formatting or backticks.
    Format: {"title": "Vendor Name", "amount": 125.50, "category": "#Dining"}`;

    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: "image/jpeg" // Meta generally provides JPEGs
        }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    let extractedData;
    try {
        extractedData = JSON.parse(responseText);
    } catch {
        throw new Error("AI returned invalid JSON format.");
    }

    // 🔒 Apply the Smart Guardrails here!
    const finalCategory = applySmartTags(extractedData.title, extractedData.category);

    // 5. Format Date and Save to Firebase
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const newItem = {
        ownerId: senderPhone, // Matches the WhatsApp number to their Align profile
        type: 'expense',
        title: extractedData.title || 'Unknown Expense',
        amount: parseFloat(extractedData.amount) || 0,
        date: today,
        // Override the AI's guess with our final deterministic category
        category: finalCategory,
        tags: [finalCategory],
        splits: [],
        createdAt: now.toISOString() 
    };

    await db.collection('planner_items').add(newItem);
    console.log(`✅ Saved to Firebase: ${newItem.title} for ₹${newItem.amount}`);

    // 6. Send Confirmation back to WhatsApp
    await sendWhatsAppTextMessage(senderPhone, `✅ Logged ₹${newItem.amount} for ${newItem.title} under ${finalCategory}.`);
}

// ==========================================
// 4. NATURAL LANGUAGE TEXT & QUERY HANDLER
// ==========================================
async function processTextQuery(text: string, senderPhone: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Missing Gemini API Token");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Step 1: Intent Classification
    const intentPrompt = `You are a financial router. Did the user just describe a transaction to log (e.g. "spent 500 on food", "got paid 1000") OR are they asking a question about their finances (e.g. "how much did I spend", "am I over budget")?
    Respond ONLY in JSON format: {"intent": "LOG" | "QUERY"}`;
    
    const intentResult = await model.generateContent([intentPrompt, text]);
    const intentResponse = intentResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    let intentJson = { intent: "LOG" }; // Default fallback
    
    try {
        intentJson = JSON.parse(intentResponse);
    } catch {
        console.warn("Intent parsing failed, defaulting to LOG.");
    }

    if (intentJson.intent === "LOG") {
        console.log("Intent: LOG -> Parsing and saving transaction");
        const logPrompt = `Extract the financial transaction details from this text: "${text}".
        Respond ONLY with a valid, raw JSON object. Do not include markdown formatting or backticks.
        Format: {"title": "Vendor or item name", "amount": 100, "type": "expense" | "income", "category": "#Dining" | "#Travel" | "#Academics" | "#General"}`;
        
        try {
            const logResult = await model.generateContent(logPrompt);
            const logText = logResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const logData = JSON.parse(logText);

            const finalCategory = logData.type === 'expense'
                ? applySmartTags(logData.title, logData.category)
                : '#Income';

            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

            const newItem = {
                ownerId: senderPhone,
                type: logData.type || 'expense',
                title: logData.title || 'Expense',
                amount: parseFloat(logData.amount) || 0,
                date: today,
                category: finalCategory,
                tags: [finalCategory],
                splits: [],
                createdAt: now.toISOString()
            };

            await db.collection('planner_items').add(newItem);
            console.log(`✅ Saved to Firebase: ${newItem.title} for ₹${newItem.amount}`);

            await sendWhatsAppTextMessage(senderPhone, `✅ Logged ₹${newItem.amount} for ${newItem.title} under ${finalCategory}.`);
        } catch (err) {
            console.error("Failed to log transaction via text:", err);
        }
    } else {
        // Step 2: Fetch Data Context for the AI
        console.log("Intent: QUERY -> Fetching Firestore context");
        
        // Grab the current month to limit the data payload sent to Gemini
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const currentMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
        
        const snapshot = await db.collection('planner_items')
            .where('ownerId', '==', senderPhone)
            .get();

        // Filter transactions for this month to keep the AI context window fast and cheap
        const transactions = snapshot.docs
            .map(doc => doc.data())
            .filter(data => (data.type === 'expense' || data.type === 'income') && data.date && data.date.startsWith(currentMonth));

        // Step 3: Generate the natural language answer
        const answerPrompt = `You are "Align", a highly capable financial assistant. 
        Here is the user's transaction data for this month: ${JSON.stringify(transactions)}.
        Answer their question directly, accurately, and conversationally. Do not mention the JSON data itself. Keep the response punchy and under 3 sentences.
        User question: "${text}"`;

        const answerResult = await model.generateContent(answerPrompt);
        const finalAnswer = answerResult.response.text();

        // Step 4: Send the insight back to WhatsApp
        await sendWhatsAppTextMessage(senderPhone, finalAnswer);
    }
}