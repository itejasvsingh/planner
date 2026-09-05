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
                
                // Await in serverless runtime so Vercel does not freeze execution before completion
                await processReceiptImage(imageId, senderPhone).catch(console.error);
            } 
            // ROUTE B: Handle Text
            else if (message.type === 'text') {
                const textBody = message.text.body;
                console.log(`💬 Text from ${senderPhone}: ${textBody}`);
                
                // Await in serverless runtime so Vercel does not freeze execution before completion
                await processTextQuery(textBody, senderPhone).catch(console.error);
            }
            // ROUTE C: Handle Voice Notes / Audio
            else if (message.type === 'audio') {
                const audioId = message.audio.id;
                const mimeType = message.audio.mime_type;
                console.log(`🎙️ Voice note from ${senderPhone}. ID: ${audioId} (MIME: ${mimeType || 'default'})`);
                
                // Await in serverless runtime so Vercel does not freeze execution before completion
                await processAudioMessage(audioId, senderPhone, mimeType).catch(console.error);
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
// GEMINI MULTI-MODEL DISPATCHER
// ==========================================
async function generateWithGemini(
    genAI: GoogleGenerativeAI, 
    contents: any,
    config?: { temperature?: number; maxOutputTokens?: number }
) {
    const candidateConfigs = [
        { model: "gemini-3.6-flash" },
        { model: "gemini-3.8-flash" },
        { model: "gemini-3.5-flash" },
        { model: "gemini-2.5-flash" },
        { model: "gemini-flash-latest" },
        { model: "gemini-3.6-flash", apiVersion: "v1" },
        { model: "gemini-2.5-flash", apiVersion: "v1" },
        { model: "gemini-1.5-flash" },
    ];
    let lastError: any;
    for (const item of candidateConfigs) {
        try {
            const requestOptions = item.apiVersion ? { apiVersion: item.apiVersion } : undefined;
            const model = genAI.getGenerativeModel(
                { 
                    model: item.model,
                    generationConfig: config ? {
                        temperature: config.temperature ?? 0.1,
                        maxOutputTokens: config.maxOutputTokens ?? 150,
                    } : undefined
                }, 
                requestOptions
            );
            return await model.generateContent(contents);
        } catch (err: any) {
            lastError = err;
            if (err?.status === 404 || err?.message?.includes("404")) {
                console.warn(`⚠️ Model ${item.model} (${item.apiVersion || 'default'}) returned 404, attempting fallback...`);
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}

// ==========================================
// 3. META API MEDIA DOWNLOADER & AI PARSER
// ==========================================
async function processReceiptImage(imageId: string, senderPhone: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Missing Gemini API Token");

    try {
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

        // 4. Send to Gemini with constrained parameters for rapid JSON generation
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

        const result = await generateWithGemini(genAI, [prompt, imagePart], { temperature: 0.0, maxOutputTokens: 150 });
        const responseText = result.response.text();
        
        let extractedData;
        try {
            const match = responseText.match(/\{[\s\S]*\}/);
            extractedData = JSON.parse(match ? match[0] : responseText);
        } catch {
            throw new Error("AI returned invalid JSON format.");
        }

        // 🔒 Apply the Smart Guardrails here!
        const finalCategory = applySmartTags(extractedData.title, extractedData.category);

        // 5. Format Date and Save to Firebase concurrently with WhatsApp notification
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        const newItem = {
            ownerId: senderPhone, // Matches the WhatsApp number to their Align profile
            type: 'expense',
            title: extractedData.title || 'Unknown Expense',
            amount: parseFloat(extractedData.amount) || 0,
            date: today,
            category: finalCategory,
            tags: [finalCategory],
            splits: [],
            createdAt: now.toISOString() 
        };

        // Decoupled concurrent persistence and WhatsApp delivery
        await Promise.all([
            db.collection('planner_items').add(newItem).then(() => {
                console.log(`✅ Saved to Firebase: ${newItem.title} for ₹${newItem.amount}`);
            }),
            sendWhatsAppTextMessage(senderPhone, `✅ Logged ₹${newItem.amount} for ${newItem.title} under ${finalCategory}.`)
        ]);
    } catch (err: any) {
        console.error("❌ processReceiptImage error:", err);
        await sendWhatsAppTextMessage(senderPhone, `⚠️ Receipt processing error: ${err.message}`);
    }
}

// ==========================================
// 4. NATURAL LANGUAGE TEXT & QUERY HANDLER
// ==========================================
async function processTextQuery(text: string, senderPhone: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Missing Gemini API Token");

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

        // 1. Instant Intent Classification (Regex)
        // Matches expense keywords + numbers (e.g., "spent 200", "coffee 150 rs", "paid 400")
        const isLoggingExpense = /(spent|paid|bought|rs|inr|cost|₹)/i.test(text) && /\d/.test(text);

        if (isLoggingExpense) {
            console.log(`Intent: LOG -> Extracting expense data from "${text}"...`);
            
            // A. Extract data using Gemini with constrained parameters (0.0 temp, 150 max tokens)
            const extractionPrompt = `Extract the vendor name and total amount from this text: "${text}".
Categorize into #Dining, #Travel, #Academics, or #General. 
Respond ONLY with a valid, raw JSON object. Do not include markdown formatting or backticks.
Format: {"title": "Vendor", "amount": 100, "category": "#General"}`;

            const result = await generateWithGemini(genAI, extractionPrompt, { temperature: 0.0, maxOutputTokens: 150 });
            const responseText = result.response.text();
            
            let extractedData;
            try {
                const match = responseText.match(/\{[\s\S]*\}/);
                extractedData = JSON.parse(match ? match[0] : responseText);
            } catch {
                throw new Error("AI returned invalid JSON format.");
            }

            // B. Apply Smart Guardrails
            const finalCategory = applySmartTags(extractedData.title, extractedData.category);

            // C. Format Date and Save to Firebase
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

            const newItem = {
                ownerId: senderPhone,
                type: 'expense',
                title: extractedData.title || 'Expense',
                amount: parseFloat(extractedData.amount) || 0,
                date: today,
                category: finalCategory,
                tags: [finalCategory],
                splits: [],
                createdAt: now.toISOString() 
            };

            // D. Concurrently save to Firestore and dispatch WhatsApp confirmation
            await Promise.all([
                db.collection('planner_items').add(newItem).then(() => {
                    console.log(`✅ Saved to Firebase: ${newItem.title} for ₹${newItem.amount}`);
                }),
                sendWhatsAppTextMessage(senderPhone, `✅ Logged ₹${newItem.amount} for ${newItem.title} under ${finalCategory}.`)
            ]);

        } else {
            console.log(`Intent: QUERY -> Fetching Firestore context for "${text}"...`);
            
            // A. Fetch Context
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const currentMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
            
            const snapshot = await db.collection('planner_items')
                .where('ownerId', '==', senderPhone)
                .get();

            const transactions = snapshot.docs
                .map(doc => doc.data())
                .filter(data => (data.type === 'expense' || data.type === 'income') && data.date && data.date.startsWith(currentMonth));

            // B. Generate Conversational Answer (constrained to 250 tokens)
            const answerPrompt = `You are "Align", a highly capable financial assistant. 
Here is the user's transaction data for this month: ${JSON.stringify(transactions)}.
Answer their question directly, accurately, and conversationally. Do not mention the JSON data itself. Keep the response punchy and under 3 sentences.
User question: "${text}"`;

            const answerResult = await generateWithGemini(genAI, answerPrompt, { temperature: 0.2, maxOutputTokens: 250 });
            const finalAnswer = answerResult.response.text().trim();

            // C. Send Answer to WhatsApp
            await sendWhatsAppTextMessage(senderPhone, finalAnswer);
        }

    } catch (err: any) {
        console.error("❌ processTextQuery failure:", err);
        const is404 = err?.status === 404 || err?.message?.includes("404");
        if (is404) {
            await sendWhatsAppTextMessage(
                senderPhone,
                "⚠️ Gemini API Key setup needed: The current GEMINI_API_KEY is not authorized for Gemini models. Please get a free API key from https://aistudio.google.com/app/apikey and update Vercel."
            );
        } else {
            await sendWhatsAppTextMessage(senderPhone, `⚠️ Couldn't process request: ${err.message}`);
        }
    }
}

// ==========================================
// 5. META API AUDIO / VOICE NOTE PROCESSOR (Single-Pass Multimodal)
// ==========================================
async function processAudioMessage(audioId: string, senderPhone: string, mimeType?: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Missing Gemini API Token");

    try {
        // 1. Ask Meta for the secure download URL
        const metaUrlReq = await fetch(`https://graph.facebook.com/v17.0/${audioId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${API_TOKEN}` }
        });

        if (!metaUrlReq.ok) throw new Error("Failed to get audio URL from Meta");
        const { url: downloadUrl } = await metaUrlReq.json();

        // 2. Download audio binary
        const audioReq = await fetch(downloadUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${API_TOKEN}` }
        });

        if (!audioReq.ok) throw new Error("Failed to download audio binary");

        // 3. Convert to Base64
        const arrayBuffer = await audioReq.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString('base64');
        const cleanMimeType = (mimeType || 'audio/ogg').split(';')[0].trim();

        console.log(`🎙️ Audio downloaded (${arrayBuffer.byteLength} bytes)! Single-pass multimodal extraction with Gemini...`);

        // 4. Send audio directly to Gemini with constrained parameters (single roundtrip)
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const prompt = `Listen to this spoken audio and determine if the user is logging an expense or asking a financial question.
- If logging an expense or income (e.g. "spent 500 on dinner", "bought coffee for 150"):
  Respond in raw JSON format: {"type": "expense", "title": "Vendor or item", "amount": 100, "category": "#Dining" | "#Travel" | "#Academics" | "#General"}
- If asking a question about their finances (e.g. "how much did I spend this week?"):
  Respond in raw JSON format: {"type": "query", "question": "the user question verbatim"}
- If inaudible or silent:
  Respond in raw JSON format: {"type": "inaudible"}
Respond ONLY with a valid JSON object. Do not include markdown formatting or backticks.`;

        const audioPart = {
            inlineData: {
                data: base64Audio,
                mimeType: cleanMimeType
            }
        };

        const result = await generateWithGemini(genAI, [prompt, audioPart], { temperature: 0.0, maxOutputTokens: 150 });
        const responseText = result.response.text();
        
        let parsed: any;
        try {
            const match = responseText.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(match ? match[0] : responseText);
        } catch {
            throw new Error("AI returned invalid JSON from audio.");
        }

        if (parsed.type === 'expense') {
            const finalCategory = applySmartTags(parsed.title, parsed.category);
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

            const newItem = {
                ownerId: senderPhone,
                type: 'expense',
                title: parsed.title || 'Expense',
                amount: parseFloat(parsed.amount) || 0,
                date: today,
                category: finalCategory,
                tags: [finalCategory],
                splits: [],
                createdAt: now.toISOString()
            };

            // Decoupled concurrent persistence and WhatsApp delivery
            await Promise.all([
                db.collection('planner_items').add(newItem).then(() => {
                    console.log(`✅ Saved to Firebase (from voice): ${newItem.title} for ₹${newItem.amount}`);
                }),
                sendWhatsAppTextMessage(senderPhone, `✅ Logged ₹${newItem.amount} for ${newItem.title} under ${finalCategory}.`)
            ]);

        } else if (parsed.type === 'query' && parsed.question) {
            console.log(`🎙️ Voice question: "${parsed.question}"`);
            await processTextQuery(parsed.question, senderPhone);
        } else {
            await sendWhatsAppTextMessage(senderPhone, "⚠️ Couldn't clearly hear that voice note. Please try again or send a text!");
        }

    } catch (err: any) {
        console.error("❌ processAudioMessage error:", err);
        await sendWhatsAppTextMessage(senderPhone, `⚠️ Voice note processing error: ${err.message}`);
    }
}