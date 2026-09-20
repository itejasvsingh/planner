const API_TOKEN = "EAAO6WemhAoABSi9ZAYNZCaYs9PaTYBLsPZBS4fU1idyA54Oj7EFhrfUZCZBnZAP6zsBIpYObOK5EMIrstcZCuAT6MekoWsspZCqtRJ39PyRftl36MZAy0ivgnK0IHyDOuQcTXXOAxFSHnoIJUfFZCKyBXbe93sYru6GqRm2NWZBnNoOgTZBEMG9N7EZANWEJ03jtBETFsdYdv3fZBX3hzbjkiZBEyMui9tn3nL5GZCXhEBEhTwLvuZBLF5lkAyAIHX7W9DsGU5X6ZCIC0DMVEIVmU28SdDXSziYKoZA7FPOoSW6UwZDZD";
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

sendWhatsAppTextMessage("918130595547", "Test message directly from agent!");
