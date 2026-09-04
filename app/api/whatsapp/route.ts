import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

function getAdminDb() {
    if (!getApps().length) {
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'planner-app-3471f';
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

        if (clientEmail && privateKey) {
            initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
        } else {
            initializeApp({ projectId });
        }
    }
    return getFirestore();
}

function getGeminiAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
    }
    return new GoogleGenAI({ apiKey });
}

async function sendWhatsAppMessage(to: string, text: string) {
    await fetch(`https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: text }
        })
    });
}

// 1. THIS HANDLES META'S WEBHOOK VERIFICATION
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');
    
    // Verifies using the token from your original file
    if (mode === 'subscribe' && token === 'planner_secure_token_2026') {
        return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse('Verification failed', { status: 403 });
}

// 2. THIS RECEIVES YOUR ACTUAL WHATSAPP MESSAGES
export async function POST(req: Request) {
    try {
        const db = getAdminDb();
        const body = await req.json();

        if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages) {
            const message = body.entry[0].changes[0].value.messages[0];
            const phoneDigits = String(message.from || '').replace(/\D/g, '');
            const senderPhone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
            if (!senderPhone) return new NextResponse('EVENT_RECEIVED', { status: 200 });
            
            const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const pad = (n: number) => String(n).padStart(2, '0');
            const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

            // --- FAST-PATH FOR BUTTONS ---
            if (message.type === 'interactive') {
                const btnId = message.interactive.button_reply.id;
                if (btnId.includes('|')) {
                    const [action, docId] = btnId.split('|');
                    
                    if (action === 'done') {
                        await db.collection('planner_items').doc(docId).update({ done: true });
                        await sendWhatsAppMessage(senderPhone, "✅ Marked as Done! It's been removed from your active agenda.");
                        return new NextResponse('EVENT_RECEIVED', { status: 200 });
                    } 
                    if (action === '1h') {
                        const newTime = new Date(now.getTime() + 60 * 60 * 1000);
                        const timeStr = `${pad(newTime.getHours())}:${pad(newTime.getMinutes())}`;
                        await db.collection('planner_items').doc(docId).update({ reminderTime: timeStr, dueDate: today });
                        await sendWhatsAppMessage(senderPhone, `⏰ Reminder bumped by 1 hour. Will alert you at ${timeStr}.`);
                        return new NextResponse('EVENT_RECEIVED', { status: 200 });
                    }
                    if (action === 'tom') {
                        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                        const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}`;
                        await db.collection('planner_items').doc(docId).update({ dueDate: dateStr });
                        await sendWhatsAppMessage(senderPhone, `📅 Snoozed! Pushed to tomorrow's agenda (${dateStr}).`);
                        return new NextResponse('EVENT_RECEIVED', { status: 200 });
                    }
                }
            }

            // --- AI PARSING ---
            let textInput = "";
            let mediaId = null;
            let mediaMimeType = null;
            let inputType = "text";

            if (message.type === 'text') { textInput = message.text.body; }
            else if (message.type === 'audio') { mediaId = message.audio.id; mediaMimeType = message.audio.mime_type || "audio/ogg"; inputType = "audio"; }
            else if (message.type === 'image') { mediaId = message.image.id; mediaMimeType = message.image.mime_type || "image/jpeg"; textInput = message.image.caption || ""; inputType = "image"; }
            else { return new NextResponse('EVENT_RECEIVED', { status: 200 }); }

            const sessionRef = db.collection('user_sessions').doc(senderPhone);
            const sessionSnap = await sessionRef.get();
            const lastSession = sessionSnap.exists ? sessionSnap.data() : null;

            // --- FETCH DATABASE CONTEXT FOR QUERIES ---
            const allItemsSnapshot = await db.collection('planner_items').where('ownerId', '==', senderPhone).get();
            const allDocs = allItemsSnapshot.docs.map(d => d.data());
            
            const currentMonth = today.substring(0, 7); // e.g., "2026-09"
            
            // Filter in memory to avoid requiring complex Firestore composite indexes
            const databaseContext = allDocs.filter((item: any) => {
                if (item.type === 'expense' || item.type === 'income') {
                    return (item.date || item.dueDate || '').startsWith(currentMonth);
                }
                if (item.type === 'task') {
                    // Keep pending tasks or tasks happening today/future
                    return !item.done || (item.dueDate && item.dueDate >= today);
                }
                return false;
            });

            const prompt = `
            You are an elite personal planning and financial assistant.
            Today's date is: ${today}.
            
            Previous context (last logged item):
            ${JSON.stringify(lastSession?.lastItem || null)}

            Current Database Context (Active tasks & this month's finances):
            ${JSON.stringify(databaseContext)}

            Input type: ${inputType}
            Attached text: "${textInput}"

            Determine the user's intent: "NEW_ENTRY", "CORRECTION", or "QUERY".

            INSTRUCTIONS BY INTENT:
            1. QUERY: If the user is ASKING about their data (e.g., "How much have I spent?", "What is my schedule?"), set intent to "QUERY". Analyze the Database Context and provide a concise, accurate, and conversational answer in "replyText". The "items" array must be empty [].
            2. NEW_ENTRY: If the user is ADDING tasks/expenses, set intent to "NEW_ENTRY". Extract ALL items into the "items" array.
            3. CORRECTION: If the user is updating the last added item, set intent to "CORRECTION".

            DATA EXTRACTION RULES (For NEW_ENTRY / CORRECTION):
            - EXPENSE/INCOME: Extract "title", "amount", "dueDate" (or date). Assign a logical "category" (e.g., "#Dining").
            - TASK/EVENT: Set "type" to "task". If a date range is given, use the START date as "dueDate" and put the range in the "title". Extract "dueTime" and "endTime" (12-hour format) if present.

            Return ONLY a JSON object matching this exact structure:
            {
              "intent": "NEW_ENTRY" | "CORRECTION" | "QUERY",
              "replyText": "Natural confirmation or the answer to the user's question.",
              "items": [
                {
                  "type": "task" | "expense" | "income",
                  "title": "string",
                  "dueDate": "YYYY-MM-DD",
                  "dueTime": "12-hour time or null",
                  "endTime": "12-hour time or null",
                  "amount": number or null,
                  "category": "string tag or null"
                }
              ]
            }`;

            let contents: any[] = [];
            if (mediaId) {
                const mediaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { 'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}` } });
                const mediaData = await mediaRes.json();
                const binRes = await fetch(mediaData.url, { headers: { 'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}` } });
                const mediaBuffer = await binRes.arrayBuffer();
                contents = [ prompt + `\n\nAnalyze this ${inputType}. Caption: "${textInput}"`, { inlineData: { data: Buffer.from(mediaBuffer).toString("base64"), mimeType: mediaMimeType } } ];
            } else {
                contents = [prompt];
            }

            const ai = getGeminiAI();
            const response = await ai.models.generateContent({ model: 'gemini-flash-lite-latest', contents: contents, config: { responseMimeType: "application/json" } });
            const parsed = JSON.parse(response.text || '{}');
            
            let docId = lastSession?.lastDocId || null;
            const savedItems: any[] = [];

            if (parsed.intent === 'QUERY') {
                // Do absolutely nothing to the database.
                // Gemini has already generated the conversational answer in parsed.replyText!
            } else if (parsed.intent === 'CORRECTION' && docId && parsed.items && parsed.items.length > 0) {
                const item = parsed.items[0]; // Apply correction to the single last item
                await db.collection('planner_items').doc(docId).update({
                    title: item.title, dueDate: item.dueDate || null, dueTime: item.dueTime || null, endTime: item.endTime || null,
                    amount: item.amount || null, category: item.category || null, tags: item.tags || [], quadrant: item.quadrant || null,
                    updatedAt: FieldValue.serverTimestamp()
                });
                savedItems.push(item);
            } else if (parsed.items && parsed.items.length > 0) {
                // Batch write all extracted items
                const batch = db.batch();
                parsed.items.forEach((item: any) => {
                    const newRef = db.collection('planner_items').doc();
                    batch.set(newRef, {
                        ownerId: senderPhone,
                        type: item.type, title: item.title,
                        dueDate: item.dueDate || null, dueTime: item.dueTime || null, endTime: item.endTime || null,
                        amount: item.amount || null, category: item.category || (item.tags && item.tags.length > 0 ? item.tags[0] : '#General'),
                        tags: item.tags || [], quadrant: item.quadrant || null,
                        origin: inputType, confirmed: false, createdAt: FieldValue.serverTimestamp(),
                        // Add UI-required fields so it doesn't break the frontend
                        ...(item.type === 'task' ? { done: false, subtasks: [] } : {}),
                        ...(item.type === 'expense' ? { splits: [] } : {})
                    });
                    docId = newRef.id; // Save last docId for potential correction
                    savedItems.push(item);
                });
                await batch.commit();
            }

            if (parsed.intent !== 'QUERY') {
                await sessionRef.set({
                    lastDocId: docId,
                    lastItem: savedItems.length > 0 ? savedItems[savedItems.length - 1] : null,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }

            // RESPONSE WITH BUTTONS FOR TASKS
            let metaPayload: any = { messaging_product: 'whatsapp', to: senderPhone, type: 'text', text: { body: parsed.replyText } };
            
            // If the first item added was a task, provide quick buttons for it
            if (parsed.items && parsed.items[0]?.type === 'task' && docId && parsed.intent !== 'CORRECTION' && parsed.intent !== 'QUERY') {
                metaPayload = {
                    messaging_product: 'whatsapp', to: senderPhone, type: 'interactive',
                    interactive: {
                        type: 'button', body: { text: parsed.replyText + "\n\n(Buttons apply to the last item added)" },
                        action: { buttons: [ { type: 'reply', reply: { id: `done|${docId}`, title: 'Done' } }, { type: 'reply', reply: { id: `1h|${docId}`, title: 'Remind in 1h' } }, { type: 'reply', reply: { id: `tom|${docId}`, title: 'Tomorrow' } } ] }
                    }
                };
            }

            await fetch(`https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(metaPayload)
            });
            
            return new NextResponse('EVENT_RECEIVED', { status: 200 });
        }
        
        return new NextResponse('EVENT_RECEIVED', { status: 200 });
        
    } catch (error) {
        console.error('Execution Error:', error);
        return new NextResponse('EVENT_RECEIVED', { status: 200 });
    }
}