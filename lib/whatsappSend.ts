/**
 * Sends the 6-digit login code on WhatsApp.
 *
 * With WHATSAPP_AUTH_TEMPLATE set (an approved "Authentication" template with a copy-code button), the code
 * arrives any time. Without it, it goes as a normal message, which WhatsApp only delivers if the person has
 * messaged the Align number in the last 24 hours; WhatsApp still accepts the request either way, so the app
 * always shows how to fix a code that doesn't arrive.
 */
export async function sendLoginCode(to: string, code: string): Promise<{ ok: boolean; template: boolean }> {
  const token = process.env.WHATSAPP_API_TOKEN || process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID || process.env.PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_AUTH_TEMPLATE;
  if (!token || !phoneId) return { ok: false, template: false };

  const message = template
    ? {
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_AUTH_TEMPLATE_LANG || 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }
    : { type: 'text', text: { body: `${code} is your Align login code. It expires in 10 minutes. Don't share it with anyone.` } };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, ...message }),
    });
    if (!res.ok) console.warn('WhatsApp login code not accepted:', res.status, (await res.text()).slice(0, 300));
    return { ok: res.ok, template: !!template };
  } catch (e) {
    console.warn('WhatsApp login code failed:', (e as Error).message);
    return { ok: false, template: !!template };
  }
}
