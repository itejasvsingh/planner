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
    // Models with high free-tier limits (1,500 requests/day vs 20 for preview 3.6)
    const candidateConfigs = [
        { model: "gemini-2.5-flash" },        // 1,500 RPD free tier!
        { model: "gemini-2.5-flash-lite" },   // 1,500 RPD free tier!
        { model: "gemini-flash-latest" },
        { model: "gemini-2.5-flash", apiVersion: "v1" },
        { model: "gemini-3.5-flash" },
        { model: "gemini-3.6-flash" },
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
            const isFallbackError = 
                err?.status === 404 || 
                err?.status === 429 || 
                err?.status === 503 ||
                err?.message?.includes("404") || 
                err?.message?.includes("429") || 
                err?.message?.includes("quota") || 
                err?.message?.includes("Too Many Requests");

            if (isFallbackError) {
                console.warn(`⚠️ Model ${item.model} (${item.apiVersion || 'default'}) returned status ${err?.status || 'error'} (${err?.message?.slice(0, 60)}), attempting fallback...`);
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
        
        let extractedData: any = null;
        try {
            const match = responseText.match(/\{[\s\S]*\}/);
            if (match) extractedData = JSON.parse(match[0]);
        } catch {
            extractedData = null;
        }

        if (!extractedData || !extractedData.amount || isNaN(parseFloat(extractedData.amount))) {
            await sendWhatsAppTextMessage(
                senderPhone,
                "⚠️ Couldn't detect a clear expense amount from this receipt. Please send a clearer picture or type the expense."
            );
            return;
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
        await sendWhatsAppTextMessage(senderPhone, "⚠️ Couldn't read that receipt clearly. Please try a clearer photo or text the expense.");
    }
}
// ==========================================
// 4. NATURAL LANGUAGE TEXT, REMINDER & QUERY HANDLER
// ==========================================

function getKolkataDate() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const currentDayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    return { now, today, currentTime, currentDayName };
}

function normalizeTime(timeStr?: string | null): string | null {
    if (!timeStr) return null;
    const s = timeStr.trim();
    // 24-hour format: "08:00" or "8:00"
    const match24 = s.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
        return `${match24[1].padStart(2, '0')}:${match24[2]}`;
    }
    // 12-hour AM/PM with minutes: "8:00 AM", "08:00 PM"
    const match12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match12) {
        let h = parseInt(match12[1], 10);
        const m = match12[2];
        const mer = match12[3].toUpperCase();
        if (mer === 'AM' && h === 12) h = 0;
        if (mer === 'PM' && h !== 12) h += 12;
        return `${String(h).padStart(2, '0')}:${m}`;
    }
    // Simple 12-hour without minutes: "8 AM", "5pm"
    const matchSimple = s.match(/^(\d{1,2})\s*(AM|PM)$/i);
    if (matchSimple) {
        let h = parseInt(matchSimple[1], 10);
        const mer = matchSimple[2].toUpperCase();
        if (mer === 'AM' && h === 12) h = 0;
        if (mer === 'PM' && h !== 12) h += 12;
        return `${String(h).padStart(2, '0')}:00`;
    }
    return s;
}

function formatFriendlyDate(dateStr: string, timeStr?: string | null): string {
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const targetDate = new Date(y, m - 1, d);
        const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
        const monthName = targetDate.toLocaleDateString('en-US', { month: 'short' });
        const base = `${dayName}, ${d} ${monthName} ${y}`;
        if (timeStr) {
            return `${base} at ${timeStr} hrs`;
        }
        return base;
    } catch {
        return timeStr ? `${dateStr} at ${timeStr} hrs` : dateStr;
    }
}

async function handleConversationalQuery(genAI: GoogleGenerativeAI, text: string, senderPhone: string) {
    console.log(`Intent: QUERY/CONVERSATION -> Fetching context for "${text.slice(0, 50)}" from ${senderPhone}...`);

    const { today, currentDayName } = getKolkataDate();
    const currentMonth = today.substring(0, 7);

    const snapshot = await db.collection('planner_items')
        .where('ownerId', '==', senderPhone)
        .get();

    const allDocs = snapshot.docs.map(doc => doc.data());

    // 1. Pending tasks and upcoming reminders
    const pendingTasks = allDocs
        .filter((i: any) => i.type === 'task' && !i.done)
        .map((i: any) => ({
            title: i.title,
            dueDate: i.dueDate,
            dueTime: i.dueTime || i.reminderTime,
            category: i.category
        }));

    // 2. Transactions for this month
    const monthlyFinances = allDocs
        .filter((i: any) => (i.type === 'expense' || i.type === 'income') && i.date && i.date.startsWith(currentMonth))
        .map((i: any) => ({
            type: i.type,
            title: i.title,
            amount: i.amount,
            date: i.date,
            category: i.category
        }));

    const answerPrompt = `You are "Align", a friendly, concise, and intelligent personal assistant on WhatsApp.
Today is: ${today} (${currentDayName}).
User's upcoming tasks & reminders: ${JSON.stringify(pendingTasks)}
User's financial transactions this month: ${JSON.stringify(monthlyFinances)}

User message: "${text}"

Instructions:
- If the user asks about their tasks, schedule, agenda, or reminders: answer directly, punchily, and accurately using their task list.
- If the user asks about their expenses, budget, or spending: answer directly, punchily, and accurately using their transaction data.
- If the user sent a casual greeting or message: greet them warmly and let them know they can log expenses (e.g., "Spent 200 on lunch"), add reminders or forward deadlines (e.g. forward assignment or "Doctor appointment tomorrow 5pm"), or ask about their schedule/spending.
Keep the response punchy, helpful, and under 3 sentences. Do not mention JSON or technical details.`;

    const answerResult = await generateWithGemini(genAI, answerPrompt, { temperature: 0.2, maxOutputTokens: 250 });
    const finalAnswer = answerResult.response.text().trim();

    if (finalAnswer) {
        await sendWhatsAppTextMessage(senderPhone, finalAnswer);
    }
}

async function processTextQuery(text: string, senderPhone: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Missing Gemini API Token");

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const { now, today, currentTime, currentDayName } = getKolkataDate();

        // Intelligent multi-intent prompt: Handles reminders/deadlines, expenses, queries, and conversation
        const prompt = `You are "Align", an elite personal planning and financial assistant on WhatsApp.
Today's date is: ${today} (${currentDayName}).
Current time is: ${currentTime} (IST).

User message:
"${text}"

Determine the user's primary intent:
1. "REMINDER": The user wants to add a reminder, task, deadline, appointment, meeting, flight, or has forwarded an announcement/email/assignment containing a deadline, date, time, or action item (e.g., "remind me to call John at 5pm", "Dentist appointment tomorrow 4pm", "Deadline: 07th September (Monday, 08.00 hrs.) submit PPT on Moodle", "Meeting with team on Friday at 11am").
2. "EXPENSE": The user spent, paid, bought, or received money (e.g., "spent 200 on lunch", "coffee 150 rs", "paid 400 for uber", "swiggy 350", "₹500 groceries", "lunch 120").
3. "QUERY": The user is asking about their schedule, pending tasks, deadlines, reminders, expenses, budget, or financial summary (e.g., "how much did I spend?", "what are my reminders for tomorrow?", "what's on my agenda today?").
4. "CONVERSATION": Casual greeting, thank you, or general chat with no task, expense, or question.

EXTRACTION RULES:
- For REMINDER:
  * "title": A clean, concise, and descriptive title for the task/reminder (e.g., "Submit CRM Case Study PPT on Moodle", "Call John", "Dentist Appointment").
  * "dueDate": "YYYY-MM-DD" format. Resolve relative dates like "tomorrow", "Monday", "07th September" based on today (${today}, ${currentDayName}). If no date is mentioned, use "${today}".
  * "dueTime": "HH:mm" in 24-hour format (e.g. "08:00", "16:30") or null if no time is specified. Note: "08.00 hrs" is "08:00".
  * "category": Choose the most fitting tag: "#Academics", "#Work", "#Personal", or "#General".
- For EXPENSE:
  * "title": Vendor or item name (e.g., "Lunch", "Uber", "Groceries").
  * "amount": Numerical amount (e.g., 250).
  * "category": "#Dining", "#Travel", "#Academics", or "#General".

Respond ONLY with a valid raw JSON object. Do not include markdown formatting or backticks.
Format:
- If REMINDER: {"intent": "REMINDER", "title": "string", "dueDate": "YYYY-MM-DD", "dueTime": "HH:mm" | null, "category": "string"}
- If EXPENSE: {"intent": "EXPENSE", "title": "string", "amount": number, "category": "string"}
- If QUERY: {"intent": "QUERY"}
- If CONVERSATION: {"intent": "CONVERSATION", "reply": "string"}`;

        const result = await generateWithGemini(genAI, prompt, { temperature: 0.0, maxOutputTokens: 200 });
        const responseText = result.response.text();

        let parsed: any = null;
        try {
            const match = responseText.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
        } catch {
            parsed = null;
        }

        // 1. Handle REMINDER / TASK / DEADLINE
        if (parsed?.intent === 'REMINDER' && parsed.title) {
            const dueDate = parsed.dueDate || today;
            const dueTime = normalizeTime(parsed.dueTime);
            const category = parsed.category || '#General';

            const newItem = {
                ownerId: senderPhone,
                type: 'task',
                title: parsed.title,
                dueDate: dueDate,
                dueTime: dueTime,
                reminderTime: dueTime,
                endTime: null,
                category: category,
                tags: [category],
                priority: 'P2',
                done: false,
                subtasks: [],
                origin: 'whatsapp',
                createdAt: now.toISOString()
            };

            const dateFormatted = formatFriendlyDate(dueDate, dueTime);
            const confirmationText = `⏰ Added reminder: *${parsed.title}*\n📅 *${dateFormatted}*\n🏷️ ${category}`;

            await Promise.all([
                db.collection('planner_items').add(newItem).then(() => {
                    console.log(`✅ Saved reminder to Firebase: "${newItem.title}" on ${dueDate} ${dueTime || ''}`);
                }),
                sendWhatsAppTextMessage(senderPhone, confirmationText)
            ]);
            return;
        }

        // 2. Handle EXPENSE
        const parsedAmount = parseFloat(parsed?.amount);
        if (parsed?.intent === 'EXPENSE' && !isNaN(parsedAmount) && parsedAmount > 0) {
            const finalCategory = applySmartTags(parsed.title, parsed.category);

            const newItem = {
                ownerId: senderPhone,
                type: 'expense',
                title: parsed.title || 'Expense',
                amount: parsedAmount,
                date: today,
                category: finalCategory,
                tags: [finalCategory],
                splits: [],
                createdAt: now.toISOString()
            };

            await Promise.all([
                db.collection('planner_items').add(newItem).then(() => {
                    console.log(`✅ Saved to Firebase: ${newItem.title} for ₹${newItem.amount}`);
                }),
                sendWhatsAppTextMessage(senderPhone, `✅ Logged ₹${newItem.amount} for ${newItem.title} under ${finalCategory}.`)
            ]);
            return;
        }

        // 3. Handle QUERY or CONVERSATION or FALLBACK
        await handleConversationalQuery(genAI, text, senderPhone);

    } catch (err: any) {
        console.error("❌ processTextQuery failure:", err);
        await sendWhatsAppTextMessage(senderPhone, "⚠️ Sorry, I'm having trouble processing that right now. Please try again in a moment!");
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
        const { now, today, currentTime, currentDayName } = getKolkataDate();

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
        const prompt = `Listen to this spoken audio and determine if the user is logging an expense, setting a reminder/task, or asking a question.
Today's date is: ${today} (${currentDayName}). Current time is: ${currentTime}.

Respond in raw JSON format:
- If logging an expense (e.g. "spent 500 on dinner", "bought coffee for 150"):
  {"type": "expense", "title": "Vendor or item", "amount": 100, "category": "#Dining" | "#Travel" | "#Academics" | "#General"}
- If setting a task or reminder (e.g. "remind me to call John at 5pm", "doctor appointment on Monday 8am"):
  {"type": "task", "title": "Actionable task title", "dueDate": "YYYY-MM-DD", "dueTime": "HH:mm" | null, "category": "#Academics" | "#Work" | "#Personal" | "#General"}
- If asking a question (e.g. "how much did I spend this week?", "what are my tasks for tomorrow?"):
  {"type": "query", "question": "the user question verbatim"}
- If inaudible or silent:
  {"type": "inaudible"}

Respond ONLY with a valid JSON object. Do not include markdown formatting or backticks.`;

        const audioPart = {
            inlineData: {
                data: base64Audio,
                mimeType: cleanMimeType
            }
        };

        const result = await generateWithGemini(genAI, [prompt, audioPart], { temperature: 0.0, maxOutputTokens: 200 });
        const responseText = result.response.text();
        
        let parsed: any = null;
        try {
            const match = responseText.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
        } catch {
            parsed = null;
        }

        // Voice Expense
        const parsedAmount = parseFloat(parsed?.amount);
        if (parsed?.type === 'expense' && !isNaN(parsedAmount) && parsedAmount > 0) {
            const finalCategory = applySmartTags(parsed.title, parsed.category);

            const newItem = {
                ownerId: senderPhone,
                type: 'expense',
                title: parsed.title || 'Expense',
                amount: parsedAmount,
                date: today,
                category: finalCategory,
                tags: [finalCategory],
                splits: [],
                createdAt: now.toISOString()
            };

            await Promise.all([
                db.collection('planner_items').add(newItem).then(() => {
                    console.log(`✅ Saved to Firebase (from voice): ${newItem.title} for ₹${newItem.amount}`);
                }),
                sendWhatsAppTextMessage(senderPhone, `✅ Logged ₹${newItem.amount} for ${newItem.title} under ${finalCategory}.`)
            ]);
            return;
        }

        // Voice Reminder
        if (parsed?.type === 'task' && parsed.title) {
            const dueDate = parsed.dueDate || today;
            const dueTime = normalizeTime(parsed.dueTime);
            const category = parsed.category || '#General';

            const newItem = {
                ownerId: senderPhone,
                type: 'task',
                title: parsed.title,
                dueDate: dueDate,
                dueTime: dueTime,
                reminderTime: dueTime,
                endTime: null,
                category: category,
                tags: [category],
                priority: 'P2',
                done: false,
                subtasks: [],
                origin: 'whatsapp',
                createdAt: now.toISOString()
            };

            const dateFormatted = formatFriendlyDate(dueDate, dueTime);
            const confirmationText = `⏰ Added reminder: *${parsed.title}*\n📅 *${dateFormatted}*\n🏷️ ${category}`;

            await Promise.all([
                db.collection('planner_items').add(newItem).then(() => {
                    console.log(`✅ Saved voice reminder to Firebase: "${newItem.title}" on ${dueDate} ${dueTime || ''}`);
                }),
                sendWhatsAppTextMessage(senderPhone, confirmationText)
            ]);
            return;
        }

        // Voice Query
        if (parsed?.type === 'query' && parsed.question) {
            console.log(`🎙️ Voice question: "${parsed.question}"`);
            await processTextQuery(parsed.question, senderPhone);
            return;
        }

        // Inaudible or unclear
        await sendWhatsAppTextMessage(senderPhone, "⚠️ Couldn't clearly detect an expense or reminder in that voice note. Please try again or send a text!");

    } catch (err: any) {
        console.error("❌ processAudioMessage error:", err);
        await sendWhatsAppTextMessage(senderPhone, "⚠️ Couldn't process that voice note right now. Please try again or type your expense/reminder.");
    }
}