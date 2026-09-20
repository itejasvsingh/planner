const API_TOKEN = "EAAO6WemhAoABStNb50OD4BgsIdSKjisaiskPHjSVdZACMAdbZAG6PnjUtzFnBDqkZCtRf4VYhzOZA2ZBs0xCSEKJE6gG5vVXpYTxGpvaDv3TkyZBwtZAg6UP0AT5vfwdkbAXuf7J5mi1ATKPyQT4ZCjNqQZBjqYIPVUx4OsIJ8O3qPzIT5yFzlEHlMRft4YS1rzIbGkWIn3ZBZAgmAzCtXpZAOPp9yO0wWZCnoWZAkBN3o";
const PHONE_ID = "1304237036105269";

async function sendWhatsAppTextMessage(to, text) {
    console.log(`Sending to ${to}...`);
    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: text }
            })
        });
        
        const data = await res.json();
        console.log("Response:", res.status, data);
    } catch (e) {
        console.error("Error:", e);
    }
}

sendWhatsAppTextMessage("918130595547", "✅ Connection restored! Your Align assistant is fully online with the new token.");
