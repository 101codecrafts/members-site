import 'server-only';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { complete, freeModels } from '@/lib/assistant/chat';

/**
 * On-site AI (practice explain/hint/debug, AI tools chat, quota-metered features): OpenRouter FREE models only.
 * Round 12 (legal LG3 + cost): the Vercel AI Gateway (its default model was a PAID OpenAI model billed to gateway
 * credit), Groq and Gemini providers were REMOVED. Gemini's API terms bar services likely to be used by under-18s
 * and its free tier trains on prompts. Every call now goes through the same free-only fallback chain as 101 AI
 * (lib/assistant/chat.ts: ':free' ids + the free-only openrouter/free router). Keys stay server-only env vars.
 */
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatResult { text: string; provider: string; model: string; input_tokens: number; output_tokens: number; latency_ms: number }

export function availableModels() {
  return env().OPENROUTER_API_KEY ? freeModels().map((model) => ({ provider: 'openrouter', model })) : [];
}

export async function chatComplete(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<ChatResult> {
  if (!env().OPENROUTER_API_KEY) throw new AppError('upstream_error', 'On-site AI is not configured yet');
  const t0 = Date.now();
  const attempts: Array<{ model: string; status: number | string }> = [];
  const out = await complete(messages, AbortSignal.timeout(55_000), attempts, { maxTokens: opts.maxTokens ?? 800, temperature: opts.temperature ?? 0.4, maxChars: 8000 });
  if (!out || !out.text) {
    const day = attempts.some((a) => String(a.status).includes('day-cap'));
    throw new AppError('upstream_error', day ? "The free AI allowance for today is used up; it resets at 03:00 Kampala time." : 'All free AI models are busy, try again shortly');
  }
  return { text: out.text, provider: 'openrouter', model: out.model, input_tokens: 0, output_tokens: 0, latency_ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- moderation --
// Lightweight first line for minors (the system prompt carries the rest). Not
// a replacement for a moderation model — TODO: add a moderation pass via the gateway.
const RULES: Array<{ cat: string; re: RegExp }> = [
  { cat: 'sexual', re: /\b(porn|nude|nudes|sex(ting|ual)?|xxx|onlyfans)\b/i },
  { cat: 'self_harm', re: /\b(kill myself|suicide|self[- ]harm|cut myself)\b/i },
  { cat: 'violence_weapons', re: /\b(make a bomb|build a gun|buy a gun)\b/i },
  { cat: 'drugs', re: /\b(buy (weed|cocaine|meth)|how to make (meth|drugs))\b/i },
  { cat: 'personal_info', re: /\b(\+?256\s?7\d{2}\s?\d{3}\s?\d{3}|my address is)\b/i },
];
export function moderate(text: string, isMinor: boolean): { ok: boolean; category?: string } {
  for (const r of RULES) {
    if (r.re.test(text)) {
      if (r.cat === 'self_harm') return { ok: false, category: r.cat };                 // always route to help
      if (isMinor || r.cat !== 'personal_info') return { ok: false, category: r.cat };
    }
  }
  return { ok: true };
}

export const SAFETY_SYSTEM = (isMinor: boolean) =>
  `You are the 101 Codecrafts learning assistant for students in Uganda. Be accurate, concise and encouraging. ` +
  `Teach; do not do graded work for the learner. Refuse unsafe, sexual, hateful or illegal requests. ` +
  (isMinor ? 'The user is a minor: keep everything age-appropriate, never ask for personal details, and suggest talking to a parent, guardian or teacher for personal problems. ' : '') +
  `If someone mentions self-harm, respond with care and point them to the Uganda child helpline 116 or a trusted adult.`;
