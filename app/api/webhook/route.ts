import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebase'; // Imports your existing DB connection
import firebase from 'firebase/compat/app';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { text, secret, phone } = body;

        // Security check: Only allow requests with your secret key
        if (secret !== 'ALIGN_SECRET_2026') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Extract the amount using RegEx
        const amountMatch = text.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i) || text.match(/([\d,]+\.?\d*)\s*(?:INR)/i);
        const isExpense = /debited|spent|paid|sent|deducted/i.test(text);
        
        if (!amountMatch) {
            return NextResponse.json({ success: false, message: 'No amount found' }, { status: 200 });
        }

        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        const type = isExpense ? 'expense' : 'income';

        // Try to extract a merchant name (e.g., "debited at Starbucks")
        let title = "Bank Transfer";
        const titleMatch = text.match(/(?:to|at|info|-)\s+([a-zA-Z0-9\s]+)/i);
        if (titleMatch && titleMatch[1].trim().length > 0) {
            title = titleMatch[1].substring(0, 20).trim();
        }

        // Save directly to Firebase
        await db.collection('planner_items').add({
            ownerId: phone, // Uses the phone number passed from the mobile automation
            type,
            title,
            amount,
            date: new Date().toISOString().split('T')[0],
            category: '#General',
            tags: ['#General'],
            splits: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
    }
}