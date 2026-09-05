import { NextResponse } from 'next/server';

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
                // Handle normal text parsing here
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
// 3. META API MEDIA DOWNLOADER
// ==========================================
async function processReceiptImage(imageId: string, senderPhone: string) {
    if (!API_TOKEN) throw new Error("Missing Meta API Token");

    // Step 1: Ask Meta for the secure download URL
    const metaUrlReq = await fetch(`https://graph.facebook.com/v17.0/${imageId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    
    if (!metaUrlReq.ok) throw new Error("Failed to get image URL from Meta");
    const { url: downloadUrl } = await metaUrlReq.json();

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