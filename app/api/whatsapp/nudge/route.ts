import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function sendWhatsAppMessage(to: string, text: string) {
    const token = process.env.META_ACCESS_TOKEN;
    const phoneId = process.env.PHONE_NUMBER_ID;
    if (!token || !phoneId) {
        throw new Error('Meta WhatsApp credentials not configured');
    }

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: text }
        })
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${res.status}`);
    }
}

export async function POST(req: Request) {
    try {
        const { friendName, amount, title, friendPhone } = await req.json();
        const itemName = title || 'our recent expenses';
        const messageText = `Hey ${friendName || 'there'}! Just a quick reminder from Align: you owe ₹${amount} for ${itemName}. 🍕`;

        const encodedMsg = encodeURIComponent(messageText);
        const waLink = friendPhone 
            ? `https://wa.me/${String(friendPhone).replace(/\D/g, '')}?text=${encodedMsg}`
            : `https://wa.me/?text=${encodedMsg}`;

        // If phone number provided and credentials exist, attempt direct dispatch
        if (friendPhone && process.env.META_ACCESS_TOKEN && process.env.PHONE_NUMBER_ID) {
            try {
                const cleanPhone = String(friendPhone).replace(/\D/g, '');
                const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                await sendWhatsAppMessage(targetPhone, messageText);
                return NextResponse.json({ success: true, method: 'direct', message: 'Nudge sent via WhatsApp bot!' });
            } catch (err: any) {
                console.warn('Bot nudge dispatch failed, falling back to direct link:', err.message);
                return NextResponse.json({ success: true, method: 'link', waLink, text: messageText });
            }
        }

        return NextResponse.json({ success: true, method: 'link', waLink, text: messageText });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

