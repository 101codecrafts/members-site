import 'server-only';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

/**
 * Provider chain for FREE on-site AI. Every provider below speaks the
 * OpenAI-compatible /chat/completions shape, so one client covers all of them.
 * Order: Vercel AI Gateway → OpenRouter (:free) → Groq → Gemini. Keys are
 * server-only env vars; users never supply or store keys here.
 */
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatResult { text: string; provider: string; model: string; input_tokens: number; output_tokens: number; latency_ms: number }
interface Provider { id: string; url: string; key: string; model: string; headers?: Record<string, string> }

export function providers(): Provider[] {
  const e = env();
  const list: Provider[] = [];
  if (e.AI_GATEWAY_API_KEY) list.push({ id: 'vercel-ai-gateway', url: 'https://ai-gateway.vercel.sh/v1/chat/completions', key: e.AI_GATEWAY_API_KEY, model: e.AI_MODEL });
  if (e.OPENROUTER_API_KEY) list.push({ id: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: e.OPENROUTER_API_KEY, model: e.OPENROUTER_FREE_MODEL,
    headers: { 'HTTP-Referer': e.APP_URL, 'X-Title': '101 Codecrafts' } });
  if (e.GROQ_API_KEY) list.push({ id: 'groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: e.GROQ_API_KEY, model: e.GROQ_MODEL });
  if (e.GEMINI_API_KEY) list.push({ id: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: e.GEMINI_API_KEY, model: e.GEMINI_MODEL });
  return list;
}

export function availableModels() {
  return providers().map((p) => ({ provider: p.id, model: p.model }));
}

export async function chatComplete(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<ChatResult> {
  const list = providers();
  if (!list.length) throw new AppError('upstream_error', 'On-site AI is not configured yet');
  let lastErr = '';
  for (const p of list) {
    const t0 = Date.now();
    try {
      const res = await fetch(p.url, {
        method: 'POST', signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}`, ...(p.headers ?? {}) },
        body: JSON.stringify({ model: p.model, messages, max_tokens: opts.maxTokens ?? 800, temperature: opts.temperature ?? 0.4 }),
      });
      if (res.status === 429 || res.status >= 500) { lastErr = `${p.id} ${res.status}`; continue; }   // fall through to next free provider
      if (!res.ok) { lastErr = `${p.id} ${res.status}`; continue; }
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      return { text: j.choices?.[0]?.message?.content ?? '', provider: p.id, model: p.model,
        input_tokens: j.usage?.prompt_tokens ?? 0, output_tokens: j.usage?.completion_tokens ?? 0, latency_ms: Date.now() - t0 };
    } catch (e) { lastErr = `${p.id} ${String(e)}`; }
  }
  throw new AppError('upstream_error', `All AI providers are busy, try again shortly (${lastErr.split(' ')[0]})`);
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
