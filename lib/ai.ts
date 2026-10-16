import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PARSE_GENERATION_CONFIG, PARSE_MODELS } from './parsePrompt';

/**
 * One door to the AI for structured answers, so a route doesn't care which provider answers.
 * Env: AI_PROVIDER = `gemini` (default) or `anthropic`; ANTHROPIC_API_KEY; GEMINI_API_KEY. If the chosen provider
 * fails or has no key, the other one (when its key exists) answers instead. Emails and Gmail data never come here.
 */
export type Provider = 'gemini' | 'anthropic';
export const ANTHROPIC_MODEL = 'claude-haiku-5-5';

export function providerOrder(env: Record<string, string | undefined>): Provider[] {
  const gem = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY ? ('gemini' as const) : null;
  const ant = env.ANTHROPIC_API_KEY ? ('anthropic' as const) : null;
  const first: Provider = (env.AI_PROVIDER || 'gemini').trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'gemini';
  return [first, first === 'gemini' ? 'anthropic' : 'gemini'].filter(p => (p === 'gemini' ? gem : ant)) as Provider[];
}

/** The JSON object in a model's reply, even when it wraps it in prose or a code fence. */
export function extractJson(text: string): any | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Claude through the official SDK. Haiku 5.5 rejects non-default sampling values, so no temperature; effort "low"
 * keeps a categorising call quick (thinking tokens count against max_tokens, hence the room).
 */
export async function callAnthropic(prompt: string, model = ANTHROPIC_MODEL, apiKey = process.env.ANTHROPIC_API_KEY || '') {
  const client = new Anthropic({ apiKey, timeout: 8_000, maxRetries: 1 });
  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: prompt }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request');
  const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  return { text, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
}

async function callGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '';
  const genAI = new GoogleGenerativeAI(key);
  let last: unknown;
  for (const model of PARSE_MODELS) {
    try {
      const r = await genAI.getGenerativeModel({ model, generationConfig: PARSE_GENERATION_CONFIG }).generateContent(prompt);
      const u = r.response.usageMetadata;
      return { text: r.response.text(), model, inputTokens: u?.promptTokenCount || 0, outputTokens: u?.candidatesTokenCount || 0 };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/**
 * Asks for a JSON object. `usable` decides whether an answer counts (an empty list from one provider should still let the
 * other try). Returns it with who answered, or null if nobody could.
 */
export async function generateJson(prompt: string, usable: (json: any) => boolean = () => true): Promise<{ json: any; provider: Provider; model: string } | null> {
  for (const provider of providerOrder(process.env)) {
    try {
      const r = provider === 'anthropic' ? { ...(await callAnthropic(prompt)), model: ANTHROPIC_MODEL } : await callGemini(prompt);
      const json = extractJson(r.text);
      if (json && usable(json)) return { json, provider, model: r.model };
    } catch (e) {
      console.warn(`${provider} failed:`, (e as Error)?.message?.slice(0, 160));
    }
  }
  return null;
}
