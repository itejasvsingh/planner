import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebase'; // Imports your existing DB connection
import firebase from 'firebase/compat/app';

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
        // Meta expects the pure text challenge back, not JSON
        return new NextResponse(challenge, { status: 200 });
    }

    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
}

// ==========================================
// 2. INCOMING MESSAGE HANDLER
// ==========================================
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { text, secret, phone } = body;

        // Security check: Only allow requests with your secret key
        if (secret !== 'ALIGN_SECRET_2026') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        // Ensure this is a WhatsApp status update/message
        if (body.object !== 'whatsapp_business_account') {
            return NextResponse.json({ status: 'ignored' }, { status: 404 });
        }

        // Extract the amount using RegEx
        const amountMatch = text.match(/(?:Rs\.?|INR)\s*([\d,]+\.?\d*)/i) || text.match(/([\d,]+\.?\d*)\s*(?:INR)/i);
        const isExpense = /debited|spent|paid|sent|deducted/i.test(text);
        
        if (!amountMatch) {
            return NextResponse.json({ success: false, message: 'No amount found' }, { status: 200 });
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
                // Handle normal text parsing here
            }
        }

        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        const type = isExpense ? 'expense' : 'income';
        // Meta REQUIRES a 200 OK within 3 seconds, or they will retry and eventually block you
        return NextResponse.json({ status: 'success' }, { status: 200 });

        // Try to extract a merchant name (e.g., "debited at Starbucks")
        let title = "Bank Transfer";
        const titleMatch = text.match(/(?:to|at|info|-)\s+([a-zA-Z0-9\s]+)/i);
        if (titleMatch && titleMatch[1].trim().length > 0) {
            title = titleMatch[1].substring(0, 20).trim();
        }
    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
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
// ==========================================
// 3. META API MEDIA DOWNLOADER
// ==========================================
async function processReceiptImage(imageId: string, senderPhone: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");

        return NextResponse.json({ success: true });
    // Step 1: Ask Meta for the secure download URL
    const metaUrlReq = await fetch(`https://graph.facebook.com/v17.0/${imageId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    
    if (!metaUrlReq.ok) throw new Error("Failed to get image URL from Meta");
    const { url: downloadUrl } = await metaUrlReq.json();

    } catch {
        return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
    }
    // Step 2: Download the actual image binary data using that URL
    const imageReq = await fetch(downloadUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });

    if (!imageReq.ok) throw new Error("Failed to download image binary");
    
    // Convert the image to a format the AI can read (Base64 Buffer)
    const arrayBuffer = await imageReq.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    const base64Image = imageBuffer.toString('base64');

    console.log(`✅ Image from ${senderPhone} successfully downloaded and converted to Base64! Length: ${base64Image.length}`);

    // Next steps go here:
    // 1. Send `base64Image` to Gemini/GPT-4o Vision
    // 2. Save the extracted JSON to Firestore
    // 3. Send a confirmation WhatsApp message back to `senderPhone`
}