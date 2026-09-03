import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase safely
if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
        }),
    });
}
const db = getFirestore();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

            const prompt = `
            You are an elite personal planning and financial assistant.
            Today's date is: ${today}.
            
            Previous context (last logged item):
            ${JSON.stringify(lastSession?.lastItem || null)}

            Input type: ${inputType}
            Attached text: "${textInput}"

            Determine the user's intent: "NEW_ENTRY" or "CORRECTION".

            INSTRUCTIONS BY TYPE:
            - If an IMAGE is provided (Receipt/Bill):
              * Set "type" to "expense". Extract merchant as "title", total as "amount", date as "dueDate". Assign a logical "category" (e.g., "#Dining").
            
            - If it is a TASK, EVENT, or CLASS:
              * Set "type" to "task".
              * Extract "title", "dueDate" (YYYY-MM-DD).
              * Extract "dueTime" (12-hour format e.g. "4:00 PM").
              * If a duration or end time is specified (e.g., "from 10 to 12"), extract the "endTime" (12-hour format). Otherwise null.
              * Classify Eisenhower quadrant: "Q1_DO_FIRST", "Q2_SCHEDULE", "Q3_DELEGATE", "Q4_ELIMINATE".

            - If it is an EXPENSE (spending):
              * Set "type" to "expense". Extract "title", "amount", "dueDate". Assign a "category" tag (e.g., "#Travel").

            - If it is an INCOME (receiving money/salary):
              * Set "type" to "income". Extract "title", "amount", "dueDate". Assign "category": "#Income".

            Return ONLY a JSON object:
            {
              "intent": "NEW_ENTRY" | "CORRECTION",
              "type": "task" | "expense" | "income",
              "title": "string",
              "dueDate": "YYYY-MM-DD",
              "dueTime": "12-hour time or null",
              "endTime": "12-hour time or null",
              "amount": number or null,
              "category": "string tag or null",
              "tags": ["array of project tags"],
              "quadrant": "string or null",
              "replyText": "Natural confirmation message."
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

            const response = await ai.models.generateContent({ model: 'gemini-flash-lite-latest', contents: contents, config: { responseMimeType: "application/json" } });
            const parsed = JSON.parse(response.text);
            
            let docId = lastSession?.lastDocId || null;

            if (parsed.intent === 'CORRECTION' && docId) {
                await db.collection('planner_items').doc(docId).update({
                    title: parsed.title, dueDate: parsed.dueDate || null, dueTime: parsed.dueTime || null, endTime: parsed.endTime || null,
                    amount: parsed.amount || null, category: parsed.category || null, tags: parsed.tags || [], quadrant: parsed.quadrant || null,
                    updatedAt: FieldValue.serverTimestamp()
                });
            } else {
                const newDoc = await db.collection('planner_items').add({
                    ownerId: senderPhone,
                    type: parsed.type, title: parsed.title,
                    dueDate: parsed.dueDate || null, dueTime: parsed.dueTime || null, endTime: parsed.endTime || null,
                    amount: parsed.amount || null, category: parsed.category || (parsed.tags && parsed.tags.length > 0 ? parsed.tags[0] : '#General'),
                    tags: parsed.tags || [], quadrant: parsed.quadrant || null,
                    origin: inputType, confirmed: false, createdAt: FieldValue.serverTimestamp()
                });
                docId = newDoc.id;
            }

            await sessionRef.set({
                lastDocId: docId,
                lastItem: { title: parsed.title, type: parsed.type, dueDate: parsed.dueDate, dueTime: parsed.dueTime, endTime: parsed.endTime, amount: parsed.amount },
                updatedAt: FieldValue.serverTimestamp()
            });

            // RESPONSE WITH BUTTONS FOR TASKS
            let metaPayload: any = { messaging_product: 'whatsapp', to: senderPhone, type: 'text', text: { body: parsed.replyText } };
            if (parsed.type === 'task' && docId) {
                metaPayload = {
                    messaging_product: 'whatsapp', to: senderPhone, type: 'interactive',
                    interactive: {
                        type: 'button', body: { text: parsed.replyText + "\n\nDone or need more time?" },
                        action: { buttons: [ { type: 'reply', reply: { id: `done|${docId}`, title: 'Done' } }, { type: 'reply', reply: { id: `1h|${docId}`, title: 'Remind me in 1 hour' } }, { type: 'reply', reply: { id: `tom|${docId}`, title: 'Remind me tomorrow' } } ] }
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