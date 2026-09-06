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
    let s = timeStr.trim().replace(/\s*hrs\.?$/i, ''); // Strip "hrs" or "hrs."
    s = s.replace(/(\d{1,2})\.(\d{2})/, '$1:$2'); // Replace "08.00" -> "08:00"

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

async function updateSession(senderPhone: string, data: {
    lastUserMessage?: string;
    lastBotMessage?: string;
    lastDocId?: string | null;
    lastItem?: any;
    pendingProposal?: any;
}) {
    try {
        await db.collection('user_sessions').doc(senderPhone).set({
            ...data,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (err) {
        console.warn("⚠️ Failed to update user session:", err);
    }
}

// ==========================================
// GENERALIZED ITEM PERSISTENCE ENGINE
// Saves extracted tasks, reminders, and expenses directly to Firestore
// ==========================================
async function persistExtractedItems(
    rawItems: any[], 
    senderPhone: string, 
    today: string, 
    now: Date
): Promise<{ confirmationText: string; lastDocId: string | null; lastItem: any } | null> {
    const confirmationLines: string[] = [];
    let lastSavedDocId: string | null = null;
    let lastSavedItem: any = null;

    for (const item of rawItems) {
        // --- 1. EXPENSE ---
        if (item.type === 'expense' || item.intent === 'EXPENSE') {
            const rawAmount = String(item.amount || '').replace(/,/g, '');
            const amount = parseFloat(rawAmount);
            if (!isNaN(amount) && amount > 0) {
                const finalCategory = applySmartTags(item.title, item.category);
                const expenseItem = {
                    ownerId: senderPhone,
                    type: 'expense',
                    title: item.title || 'Expense',
                    amount: amount,
                    date: item.date || today,
                    category: finalCategory,
                    tags: [finalCategory],
                    splits: [],
                    origin: 'whatsapp',
                    createdAt: now.toISOString()
                };

                const docRef = await db.collection('planner_items').add(expenseItem);
                console.log(`✅ Saved expense to Firebase: ${expenseItem.title} for ₹${expenseItem.amount}`);
                confirmationLines.push(`✅ Logged ₹${expenseItem.amount} for ${expenseItem.title} under ${finalCategory}.`);
                lastSavedDocId = docRef.id;
                lastSavedItem = expenseItem;
            }
        }
        // --- 2. REMINDER / TASK / EVENT ---
        else if (item.type === 'task' || item.intent === 'REMINDER') {
            if (item.title) {
                const dueDate = item.dueDate || today;
                const dueTime = normalizeTime(item.dueTime);
                const category = item.category || '#General';

                const taskItem = {
                    ownerId: senderPhone,
                    type: 'task',
                    title: item.title,
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

                const docRef = await db.collection('planner_items').add(taskItem);
                console.log(`✅ Saved reminder to Firebase: "${taskItem.title}" on ${dueDate} ${dueTime || ''}`);
                const dateFormatted = formatFriendlyDate(dueDate, dueTime);
                confirmationLines.push(`⏰ Added reminder: *${taskItem.title}*\n📅 *${dateFormatted}*\n🏷️ ${category}`);
                lastSavedDocId = docRef.id;
                lastSavedItem = taskItem;
            }
        }
    }

    if (confirmationLines.length > 0) {
        return {
            confirmationText: confirmationLines.join('\n\n'),
            lastDocId: lastSavedDocId,
            lastItem: lastSavedItem
        };
    }
    return null;
}

async function handleConversationalQuery(genAI: GoogleGenerativeAI, text: string, senderPhone: string, session?: any) {
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
${session?.lastBotMessage ? `Your previous reply to the user was: "${session.lastBotMessage}"` : ''}

User message: "${text}"

Instructions:
- If the user is affirming (like "yes", "sure") or replying to your previous message: respond contextually to what you previously said.
- If the user asks about their tasks, schedule, agenda, or reminders: answer directly, punchily, and accurately using their task list.
- If the user asks about their expenses, budget, or spending: answer directly, punchily, and accurately using their transaction data.
- If the user sent a casual greeting: greet them warmly and let them know they can log expenses (e.g., "Spent 200 on lunch"), forward assignments/announcements to add reminders, or ask about their schedule.
Keep the response punchy, helpful, and under 3 sentences. Do not mention JSON or technical details.`;

    const answerResult = await generateWithGemini(genAI, answerPrompt, { temperature: 0.2, maxOutputTokens: 250 });
    const finalAnswer = answerResult.response.text().trim();

    if (finalAnswer) {
        await sendWhatsAppTextMessage(senderPhone, finalAnswer);
        await updateSession(senderPhone, {
            lastUserMessage: text,
            lastBotMessage: finalAnswer
        });
    }
}

// ==========================================
// GENERALIZED NATURAL LANGUAGE & MULTI-MESSAGE PROCESSOR
// Reads any message format, decides first what it is, and extracts all details
// ==========================================
async function processTextQuery(text: string, senderPhone: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("Missing Gemini API Token");

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const { now, today, currentTime, currentDayName } = getKolkataDate();

        // 1. Fetch short-term session memory for this user
        const sessionRef = db.collection('user_sessions').doc(senderPhone);
        const sessionSnap = await sessionRef.get().catch(() => null);
        const session = sessionSnap?.exists ? sessionSnap.data() : null;

        const trimmedText = text.trim().toLowerCase();

        // 2. Fast-path: Handle simple affirmations ("yes", "sure", "add it", etc.)
        const isAffirmation = /^(yes|yeah|yep|yup|sure|add it|please add|confirm|ok|okay|do it|plz add|haan|ha|yes please|add)$/i.test(trimmedText);

        if (isAffirmation) {
            // Case A: There is a pending proposal to be added
            if (session?.pendingProposal) {
                const p = session.pendingProposal;
                const result = await persistExtractedItems([p], senderPhone, today, now);
                if (result) {
                    await sendWhatsAppTextMessage(senderPhone, result.confirmationText);
                    await updateSession(senderPhone, {
                        lastUserMessage: text,
                        lastBotMessage: result.confirmationText,
                        lastDocId: result.lastDocId,
                        lastItem: result.lastItem,
                        pendingProposal: null
                    });
                    return;
                }
            }

            // Case B: The last item was already added
            if (session?.lastItem) {
                const item = session.lastItem;
                const dateFormatted = formatFriendlyDate(item.dueDate || item.date || today, item.dueTime);
                const confirmationText = `✅ All set! *${item.title}* is already on your agenda for *${dateFormatted}*. Let me know if you need to change anything!`;

                await sendWhatsAppTextMessage(senderPhone, confirmationText);
                await updateSession(senderPhone, {
                    lastUserMessage: text,
                    lastBotMessage: confirmationText
                });
                return;
            }
        }

        // 3. Generalized Multi-Intent AI Intake Engine
        const prompt = `You are "Align", an elite personal planning and financial assistant on WhatsApp.
Today's date is: ${today} (${currentDayName}).
Current time is: ${currentTime} (IST).

${session?.lastBotMessage ? `Previous conversation turn:\nAlign previously said: "${session.lastBotMessage}"` : ''}
${session?.lastItem ? `Last logged item: ${JSON.stringify({ id: session.lastDocId, title: session.lastItem.title, date: session.lastItem.dueDate || session.lastItem.date, time: session.lastItem.dueTime })}` : ''}

Current User message:
"${text}"

YOUR OBJECTIVE:
Read the entire message carefully. People send many diverse types of messages:
- Forwarded announcements, academic assignments, homework, class syllabi, exam schedules with deadlines
- Bank debit SMS, credit card alerts, UPI transaction confirmations, payment receipts
- Flight confirmations, train PNR status, doctor/dental appointments, calendar invites, Zoom meetings
- Bills and invoices with due dates and amounts
- Casual expense notes (e.g. "lunch 250", "auto 50", "coffee 150 rs", "spent 400 on dinner")
- Casual reminders and to-dos (e.g. "remind me to call John at 5pm", "buy groceries tonight")
- Questions about past spending or schedule
- Follow-ups and corrections to the previous message ("actually make it 9am")

DECISION STEP (Decide first what this message is):
1. "INTAKE": The message contains one or more actionable items to save:
   - EXPENSE: Money spent, paid, bought, or debited (past or current transaction).
   - REMINDER / TASK: A future task, deadline, appointment, meeting, flight, or to-do.
   - Note: If a message contains BOTH (e.g. "spent 200 on lunch and remind me to submit PPT on Monday 8am"), extract both into the items array!
   - CRITICAL: When the user forwards an announcement or assignment with a deadline, DO NOT ask if they want to add it. Immediately extract it as a task so it is added directly to their planner!
2. "UPDATE_LAST": The user wants to adjust, reschedule, or correct the previous item (e.g., "actually make it 9am", "make it 500", "change date to tomorrow").
3. "QUERY": The user is asking a question about their schedule, pending tasks, deadlines, reminders, expenses, budget, or financial summary.
4. "CONVERSATION": Casual greeting, thank you, or general chat with no task, expense, or question.

EXTRACTION RULES FOR "INTAKE":
Extract every detected expense or reminder into the "items" array:
- For an expense:
  {
    "type": "expense",
    "title": "Clean vendor or item name (e.g., 'Swiggy', 'Lunch', 'Uber', 'Reliance Fresh')",
    "amount": number (positive numeric amount),
    "category": "#Dining" | "#Travel" | "#Academics" | "#Shopping" | "#Bills" | "#General"
  }
- For a reminder/task:
  {
    "type": "task",
    "title": "Concise, actionable task/event title (e.g., 'Submit CRM Case Study PPT on Moodle', 'Dentist appointment', 'Call John')",
    "dueDate": "YYYY-MM-DD", // Resolve relative dates like 'tomorrow', 'Monday', '07th September' relative to today (${today}, ${currentDayName}). Default to '${today}' if no date.
    "dueTime": "HH:mm" | null, // 24-hour format e.g. '08:00', '16:30' or null if no time specified. Note: '08.00 hrs' is '08:00'.
    "category": "#Academics" | "#Work" | "#Personal" | "#Health" | "#Bills" | "#Travel" | "#General"
  }

EXTRACTION RULES FOR "UPDATE_LAST":
- "dueDate": "YYYY-MM-DD" or null if unchanged.
- "dueTime": "HH:mm" or null if unchanged.
- "title": string or null if unchanged.
- "reply": Natural confirmation message (e.g. "Updated time to 09:00 hrs!").

Respond ONLY with a valid raw JSON object. Do not include markdown formatting or backticks.
Format:
{
  "intent": "INTAKE" | "UPDATE_LAST" | "QUERY" | "CONVERSATION",
  "items": [ ... ], // Array of extracted expenses and/or tasks (empty if not INTAKE)
  "update": { "dueDate": "...", "dueTime": "...", "title": "...", "reply": "..." }, // only for UPDATE_LAST
  "reply": "string" // reply message for CONVERSATION or UPDATE_LAST
}`;

        const result = await generateWithGemini(genAI, prompt, { temperature: 0.0, maxOutputTokens: 350 });
        const responseText = result.response.text();

        let parsed: any = null;
        try {
            const match = responseText.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
        } catch {
            parsed = null;
        }

        // A. Handle INTAKE (Reminders, Tasks, Expenses - Single or Multiple)
        const itemsToProcess: any[] = [];
        if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
            itemsToProcess.push(...parsed.items);
        } else if (parsed?.intent === 'REMINDER' || parsed?.type === 'task') {
            itemsToProcess.push({ ...parsed, type: 'task' });
        } else if (parsed?.intent === 'EXPENSE' || parsed?.type === 'expense') {
            itemsToProcess.push({ ...parsed, type: 'expense' });
        }

        if (itemsToProcess.length > 0) {
            const saved = await persistExtractedItems(itemsToProcess, senderPhone, today, now);
            if (saved) {
                await sendWhatsAppTextMessage(senderPhone, saved.confirmationText);
                await updateSession(senderPhone, {
                    lastUserMessage: text,
                    lastBotMessage: saved.confirmationText,
                    lastDocId: saved.lastDocId,
                    lastItem: saved.lastItem,
                    pendingProposal: null
                });
                return;
            }
        }

        // B. Handle UPDATE_LAST (Corrections/Rescheduling)
        const updateData = parsed?.update || parsed;
        if (parsed?.intent === 'UPDATE_LAST' && session?.lastDocId) {
            const updates: any = {};
            if (updateData.dueDate) updates.dueDate = updateData.dueDate;
            if (updateData.dueTime) {
                const normTime = normalizeTime(updateData.dueTime);
                updates.dueTime = normTime;
                updates.reminderTime = normTime;
            }
            if (updateData.title) updates.title = updateData.title;

            if (Object.keys(updates).length > 0) {
                await db.collection('planner_items').doc(session.lastDocId).update(updates);
                console.log(`✅ Updated doc ${session.lastDocId} with:`, updates);
            }

            const replyMsg = updateData.reply || parsed?.reply || "✅ Updated!";
            await sendWhatsAppTextMessage(senderPhone, replyMsg);

            await updateSession(senderPhone, {
                lastUserMessage: text,
                lastBotMessage: replyMsg,
                lastItem: { ...session.lastItem, ...updates }
            });
            return;
        }

        // C. Handle QUERY or CONVERSATION or FALLBACK
        await handleConversationalQuery(genAI, text, senderPhone, session);

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
        const prompt = `You are "Align", an elite personal planning and financial assistant on WhatsApp.
Listen to this audio carefully and determine what it contains:
Today's date is: ${today} (${currentDayName}). Current time is: ${currentTime}.

DECISION STEP:
1. "INTAKE": The user is logging one or more items:
   - An expense (e.g., "spent 500 on dinner", "bought coffee for 150")
   - A reminder/task (e.g., "remind me to call John at 5pm", "doctor appointment on Monday 8am", "submit presentation before Monday 8am")
2. "QUERY": The user is asking a question (e.g. "how much did I spend?", "what are my reminders for tomorrow?").
3. "inaudible": Audio is silent, background noise, or unclear.

Respond ONLY with a valid raw JSON object. Do not include markdown formatting or backticks.
Format:
{
  "intent": "INTAKE" | "QUERY" | "inaudible",
  "items": [
    // If expense:
    { "type": "expense", "title": "Vendor or item name", "amount": 100, "category": "#Dining" | "#Travel" | "#Academics" | "#General" },
    // If task:
    { "type": "task", "title": "Actionable task title", "dueDate": "YYYY-MM-DD", "dueTime": "HH:mm" | null, "category": "#Academics" | "#Work" | "#Personal" | "#Health" | "#General" }
  ],
  "question": "verbatim user question if QUERY"
}`;

        const audioPart = {
            inlineData: {
                data: base64Audio,
                mimeType: cleanMimeType
            }
        };

        const result = await generateWithGemini(genAI, [prompt, audioPart], { temperature: 0.0, maxOutputTokens: 300 });
        const responseText = result.response.text();
        
        let parsed: any = null;
        try {
            const match = responseText.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
        } catch {
            parsed = null;
        }

        // Process any extracted items (voice expense or voice reminder)
        const itemsToProcess: any[] = [];
        if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
            itemsToProcess.push(...parsed.items);
        } else if (parsed?.type === 'task' || parsed?.intent === 'REMINDER') {
            itemsToProcess.push({ ...parsed, type: 'task' });
        } else if (parsed?.type === 'expense' || parsed?.intent === 'EXPENSE') {
            itemsToProcess.push({ ...parsed, type: 'expense' });
        }

        if (itemsToProcess.length > 0) {
            const saved = await persistExtractedItems(itemsToProcess, senderPhone, today, now);
            if (saved) {
                await sendWhatsAppTextMessage(senderPhone, saved.confirmationText);
                await updateSession(senderPhone, {
                    lastUserMessage: "[Voice Note]",
                    lastBotMessage: saved.confirmationText,
                    lastDocId: saved.lastDocId,
                    lastItem: saved.lastItem,
                    pendingProposal: null
                });
                return;
            }
        }

        // Voice Query
        if (parsed?.intent === 'QUERY' || parsed?.question) {
            const questionText = parsed.question || "what is my schedule?";
            console.log(`🎙️ Voice question: "${questionText}"`);
            await processTextQuery(questionText, senderPhone);
            return;
        }

        // Inaudible or unclear
        await sendWhatsAppTextMessage(senderPhone, "⚠️ Couldn't clearly detect an expense or reminder in that voice note. Please try again or send a text!");

    } catch (err: any) {
        console.error("❌ processAudioMessage error:", err);
        await sendWhatsAppTextMessage(senderPhone, "⚠️ Couldn't process that voice note right now. Please try again or type your expense/reminder.");
    }
}