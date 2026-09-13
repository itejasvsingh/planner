import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export const dynamic = 'force-dynamic';

function initAdmin() {
    if (!getApps().length) {
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        if (!projectId) {
            throw new Error('Firebase Project ID is missing');
        }
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
}

function getAdminDb() {
    initAdmin();
    return getFirestore();
}

function getAdminAuth() {
    initAdmin();
    return getAuth();
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://planner-wheat-three.vercel.app',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { text, phone } = body;

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: 'Text is required' }, { status: 400, headers: corsHeaders() });
        }

        // 1. Optional authentication check via Firebase ID Token if provided
        const authHeader = req.headers.get('authorization');
        let decodedToken: any = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.substring(7).trim();
            try {
                const adminAuth = getAdminAuth();
                decodedToken = await adminAuth.verifyIdToken(idToken);
            } catch (authErr: any) {
                console.warn('Firebase token verification note (continuing unauthenticated):', authErr?.message || authErr);
            }
        }

        const db = getAdminDb();

        // 2. Persistent Firestore rate limiting (max 30 requests per hour by UID, phone, or IP)
        const forwardedFor = req.headers.get('x-forwarded-for');
        const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.headers.get('x-real-ip') || 'unknown-ip');
        const rateLimitKey = decodedToken?.uid
            ? `user_${decodedToken.uid}`
            : (phone && typeof phone === 'string' && phone.trim().length >= 4)
                ? `phone_${phone.replace(/\D/g, '') || 'valid'}`
                : `ip_${clientIp.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

        const rateLimitRef = db.collection('rate_limits').doc(`parse_${rateLimitKey}`);
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const MAX_REQUESTS_PER_HOUR = 30;

        const isAllowed = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(rateLimitRef);
            const nowMs = Date.now();

            if (!doc.exists) {
                transaction.set(rateLimitRef, {
                    count: 1,
                    resetAt: nowMs + ONE_HOUR_MS,
                    updatedAt: FieldValue.serverTimestamp(),
                    key: rateLimitKey,
                });
                return true;
            }

            const data = doc.data()!;
            const resetAt = typeof data.resetAt === 'number' ? data.resetAt : 0;

            if (nowMs > resetAt) {
                transaction.set(rateLimitRef, {
                    count: 1,
                    resetAt: nowMs + ONE_HOUR_MS,
                    updatedAt: FieldValue.serverTimestamp(),
                    key: rateLimitKey,
                });
                return true;
            }

            if ((data.count || 0) >= MAX_REQUESTS_PER_HOUR) {
                return false;
            }

            transaction.update(rateLimitRef, {
                count: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return true;
        });

        if (!isAllowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded: maximum 30 AI parse requests per hour.' },
                { status: 429, headers: corsHeaders() }
            );
        }

        // 3. Derive ownerId: from verified token, or provided phone, or fallback to 'guest'
        let ownerId = 'guest';
        if (decodedToken?.uid) {
            ownerId = decodedToken.uid;
            try {
                const userDoc = await db.collection('users').doc(decodedToken.uid).get();
                if (userDoc.exists && userDoc.data()?.phone) {
                    const cleanedPhone = String(userDoc.data()!.phone).replace(/\D/g, '');
                    if (cleanedPhone.length >= 10) {
                        ownerId = cleanedPhone;
                    }
                }
            } catch (e) {
                console.warn('Could not fetch user phone for ownerId derivation, using uid:', e);
            }
        } else if (phone && typeof phone === 'string') {
            const cleanedPhone = phone.replace(/\D/g, '');
            if (cleanedPhone.length >= 4) {
                ownerId = cleanedPhone;
            } else if (phone.trim()) {
                ownerId = phone.trim();
            }
        }

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
                User input: """${text.slice(0, 500)}"""

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
