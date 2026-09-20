const API_TOKEN = "EAAO6WemhAoABSi9ZAYNZCaYs9PaTYBLsPZBS4fU1idyA54Oj7EFhrfUZCZBnZAP6zsBIpYObOK5EMIrstcZCuAT6MekoWsspZCqtRJ39PyRftl36MZAy0ivgnK0IHyDOuQcTXXOAxFSHnoIJUfFZCKyBXbe93sYru6GqRm2NWZBnNoOgTZBEMG9N7EZANWEJ03jtBETFsdYdv3fZBX3hzbjkiZBEyMui9tn3nL5GZCXhEBEhTwLvuZBLF5lkAyAIHX7W9DsGU5X6ZCIC0DMVEIVmU28SdDXSziYKoZA7FPOoSW6UwZDZD";

async function getWaba() {
    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/me/whatsapp_business_accounts?access_token=${API_TOKEN}`);
        const data = await res.json();
        console.log("WABA Info:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
getWaba();
