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

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { text, phone } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'Text is required' }, { status: 400, headers: corsHeaders() });
        }

        const ownerId = phone ? String(phone).replace(/\D/g, '') : 'default_user';
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const pad = (n: number) => String(n).padStart(2, '0');
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        let parsedItems: any[] = [];

        // 1. Try Gemini AI if API key is provided
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            try {
                const ai = new GoogleGenAI({ apiKey });
                const prompt = `
                You are a smart personal planner assistant.
                Today's date is: ${today}.
                User input: "${text}"

                Parse the input into structured items (tasks, expenses, or income).
                Return ONLY a JSON object:
                {
                  "items": [
                    {
                      "type": "task" | "expense" | "income",
                      "title": "Clean, concise title",
                      "dueDate": "YYYY-MM-DD",
                      "dueTime": "12-hour time like 05:00 PM or null",
                      "endTime": "12-hour time or null",
                      "amount": number or null,
                      "category": "#Category tag or null"
                    }
                  ]
                }`;

                const response = await ai.models.generateContent({
                    model: 'gemini-flash-lite-latest',
                    contents: [prompt],
                    config: { responseMimeType: 'application/json' }
                });

                const parsed = JSON.parse(response.text || '{}');
                if (Array.isArray(parsed.items) && parsed.items.length > 0) {
                    parsedItems = parsed.items;
                }
            } catch (aiErr) {
                console.warn('Gemini parse failed, falling back to heuristics:', aiErr);
            }
        }

        // 2. Heuristics fallback if AI parsing produced nothing
        if (!parsedItems.length) {
            const isExpense = /debited|spent|paid|bought|buy|sent|deducted|cost|bill|food|groceries|coffee|lunch|dinner/i.test(text);
            const isIncome = /salary|credited|received|bonus|earned|deposit/i.test(text);
            const amountMatch = text.match(/(?:₹|rs\.?|inr|\$)\s*([\d,]+\.?\d*)/i) || text.match(/([\d,]+\.?\d*)\s*(?:INR|Rs|bucks|dollars)/i);

            if ((isExpense || isIncome) && amountMatch) {
                const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                const title = text
                    .replace(/(?:₹|rs\.?|inr|\$)\s*[\d,]+\.?\d*/gi, '')
                    .replace(/[\d,]+\.?\d*\s*(?:INR|Rs|bucks|dollars)/gi, '')
                    .replace(/debited|spent|paid|bought|buy|for|at/gi, '')
                    .trim() || (isExpense ? 'Expense' : 'Income');

                parsedItems.push({
                    type: isExpense ? 'expense' : 'income',
                    title: title.charAt(0).toUpperCase() + title.slice(1),
                    amount,
                    dueDate: today,
                    date: today,
                    category: isExpense ? '#General' : '#Income',
                    tags: [isExpense ? '#General' : '#Income']
                });
            } else {
                // Task parsing
                let targetDate = today;
                if (/tomorrow/i.test(text)) {
                    const tom = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    targetDate = `${tom.getFullYear()}-${pad(tom.getMonth() + 1)}-${pad(tom.getDate())}`;
                }

                // Time match like 5pm, 5:30 pm
                const timeMatch = text.match(/(\d{1,2}(?::\d{2})?)\s*(am|pm)/i);
                let dueTime: string | null = null;
                if (timeMatch) {
                    dueTime = `${timeMatch[1].toUpperCase()} ${timeMatch[2].toUpperCase()}`;
                }

                const cleanTitle = text
                    .replace(/tomorrow|today|tonight/gi, '')
                    .replace(/at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
                    .trim();

                parsedItems.push({
                    type: 'task',
                    title: cleanTitle ? (cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1)) : text,
                    dueDate: targetDate,
                    dueTime,
                    done: false
                });
            }
        }

        // 3. Save to Firestore
        const db = getAdminDb();
        const batch = db.batch();
        const savedList: any[] = [];

        for (const item of parsedItems) {
            const ref = db.collection('planner_items').doc();
            const docData = {
                ownerId,
                type: item.type,
                title: item.title,
                dueDate: item.dueDate || today,
                dueTime: item.dueTime || null,
                endTime: item.endTime || null,
                amount: item.amount || null,
                category: item.category || (item.type === 'expense' ? '#General' : item.type === 'income' ? '#Income' : null),
                tags: item.tags || (item.category ? [item.category] : []),
                createdAt: FieldValue.serverTimestamp(),
                ...(item.type === 'task' ? { done: false, subtasks: [] } : {}),
                ...(item.type === 'expense' || item.type === 'income' ? { date: item.dueDate || today, splits: [] } : {})
            };
            batch.set(ref, docData);
            savedList.push({ id: ref.id, ...docData });
        }

        await batch.commit();

        return NextResponse.json({ success: true, items: savedList }, { headers: corsHeaders() });

    } catch (err: any) {
        console.error('API /api/parse error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500, headers: corsHeaders() });
    }
}
