import 'server-only';
import { SYSTEM_PROMPT } from './knowledge.ts';

/**
 * 101 AI: OpenRouter FREE models only, so the assistant costs $0.
 * Allowed ids: anything ending ":free", plus the "openrouter/free" router (OpenRouter docs: it "falls back only to
 * other free models"). Every other id is dropped, including from an ASSISTANT_MODELS override.
 * The key is OPENROUTER_API_KEY (server-only env var). It is never logged, echoed or sent to the browser.
 *
 * Round 12 fallback chain: models are sent in GROUPS through OpenRouter's native `models` fallback array (one
 * upstream request tries up to 3 models, which spends 1 of the account's free-model requests instead of 3), and we
 * loop over the groups ourselves with per-attempt timeouts. A group that is rate-limited, down, times out or streams
 * nothing hands over to the next group. Order (picked from the live /api/v1/models list and our eval, 2026-11-05):
 * strongest general/reasoning first, then fast reliable ones, then the random free router as the last resort.
 */
export const DEFAULT_MODELS = [
  'nvidia/nemotron-3.5-super-vl:free',          // 120B MoE (12B active), 1M ctx, answered every round-7/8 test
  'google/gemma-4-31b-it:free',                 // dense 31B, strong general + multilingual
  'nvidia/nemotron-3-ultra-550b-a55b:free',     // 550B MoE frontier reasoning, slower
  'dots-studio/dots-3-note-preview:free',       // 280B MoE (16B active), 512k ctx
  'google/gemma-4-26b-a4b-it:free',
  'cohere/north-mini-code:free',                // coding-tuned
  'nvidia/nemotron-3.5-lightning:free',         // fast 30B MoE
  'openrouter/free',                            // free-only random router: last resort
];
export const GROUP = 3;
export const LIMITS = {
  maxInput: 4000, maxHistory: 12, maxHistoryChars: 14_000, maxAssistantChars: 3000, maxTokens: 2000,
  connectMs: 14_000, idleMs: 20_000, totalMs: 55_000,
};

export const isFreeModel = (m: string) => m === 'openrouter/free' || /^[\w.-]+\/[\w.:-]+:free$/.test(m);
export function freeModels(): string[] {
  const env = (process.env.ASSISTANT_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = (env.length ? env : DEFAULT_MODELS).filter(isFreeModel);
  return list.length ? list : DEFAULT_MODELS;
}
/** ':free' ids in groups of GROUP; the free-only router always gets its own last group (see the day-cap jump). */
export function modelGroups(list = freeModels()): string[][] {
  const g: string[][] = []; const ids = list.filter((m) => m !== ROUTER);
  for (let i = 0; i < ids.length; i += GROUP) g.push(ids.slice(i, i + GROUP));
  if (list.includes(ROUTER)) g.push([ROUTER]);
  return g;
}
export const ROUTER = 'openrouter/free';
/* When OpenRouter answers "free-models-per-day" the account's free quota is spent until 00:00 UTC (03:00 EAT);
   observed 2026-11-05 22:00 EAT: every ':free' group 429:day-cap while openrouter/free still answered. So after a
   day-cap we skip straight to the router until the UTC day rolls over (saves ~1 s and a wasted request per group). */
let dayCapUntil = 0;
export const _resetDayCap = () => { dayCapUntil = 0; };
export const nextUtcMidnight = (now = Date.now()) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };
/**
 * Why every model group failed, as a machine code for the client (round 12 QA fix):
 *  - 'ai_quota' only when the free daily quota is really spent: every group tried answered 429 free-models-per-day
 *    (or was skipped because an earlier request saw that), so nothing could answer until 00:00 UTC (03:00 EAT);
 *  - 'ai_unavailable' for anything else (timeouts, 5xx, per-minute 429s, empty streams, a missing key), even when
 *    some ':free' groups were skipped for the day-cap but the free router then failed for another reason.
 */
export function aiFailure(attempts: Array<{ model: string; status: number | string }>, now = Date.now()): { code: 'ai_quota'; resets_at: string } | { code: 'ai_unavailable' } {
  const quota = attempts.length > 0 && attempts.every((a) => String(a.status) === '429:day-cap' || String(a.status) === 'skip:day-cap');
  return quota ? { code: 'ai_quota', resets_at: new Date(nextUtcMidnight(now)).toISOString() } : { code: 'ai_unavailable' };
}
export const AI_UNAVAILABLE = "101 AI can't answer right now. Try again in a minute.";

/* Some free models (seen: xing4.0 via openrouter/free) write their private planning as the answer
   ("1. Analyze the Request: ... Constraint 1 ..."), which also echoes our instructions. Detect it on the first
   chunk of text and, if found, buffer the whole reply and keep only the final answer, or replace it. */
const LEAK = /(analy[sz]e the (user'?s? )?request|^\s*[*-]?\s*\**constraint\s*\d+\s*(\([^)]*\))?\s*:|self-correction|drafting the (response|answer)|internal monologue|let me (re)?read the (system|instructions))/im;
const FINAL = /(?:^|\n)\s*(?:\*\*|#+\s*)?(?:final (?:response|answer|output)|response|answer|output)\s*:?\s*(?:\*\*)?\s*:?\s*\n/gi;
export function looksLeaky(t: string) { return LEAK.test(t.slice(0, 600)); }
export function extractFinal(t: string, marker?: RegExp): string | null {
  if (marker) { const i = t.search(marker); if (i >= 0) { let last = i; let m: RegExpExecArray | null; const g = new RegExp(marker.source, marker.flags.includes('g') ? marker.flags : marker.flags + 'g'); while ((m = g.exec(t))) last = m.index; return t.slice(last).trim(); } }
  let last = -1; let len = 0; let m: RegExpExecArray | null; FINAL.lastIndex = 0;
  while ((m = FINAL.exec(t))) { last = m.index; len = m[0].length; }
  if (last < 0) return null;
  const out = t.slice(last + len).trim();
  return out.length > 20 && !looksLeaky(out) ? out : null;
}
export const LEAK_FALLBACK = "Sorry, I couldn't put together a clean answer just now. Please ask again (rewording can help).";

export interface Msg { role: 'user' | 'assistant'; content: string }
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Data minimisation for a platform with children on it: phone numbers and real-looking email addresses in the
 * user's text are replaced before the text leaves our server (example/test domains are kept for coding questions).
 */
export function scrubPersonal(s: string): string {
  return s
    .replace(/[\w.+-]+@([\w-]+\.)+[a-z]{2,}/gi, (m) => (/@(example|test|domain|email|mail\.com$|company)\b|@[\w-]+\.(test|invalid|example|local)$/i.test(m) ? m : '[email removed]'))
    .replace(/(?<![\w./-])(?:\+?256|0)[\s-]?7\d{2}[\s-]?\d{3}[\s-]?\d{3}(?![\w/-])/g, '[phone removed]')
    .replace(/(?<![\w./-])\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}(?![\w/-])/g, '[phone removed]');
}

/** Trim the conversation: last N turns, last message must be the user's, total chars capped; optional extra system context. */
export function buildMessages(history: Msg[], extra?: string, system = SYSTEM_PROMPT): ChatMessage[] {
  const h = history.slice(-LIMITS.maxHistory);
  let total = 0;
  const kept: Msg[] = [];
  for (let i = h.length - 1; i >= 0; i--) {
    const m = h[i]!;
    const c = m.role === 'user' ? scrubPersonal(m.content.slice(0, LIMITS.maxInput)) : m.content.slice(0, LIMITS.maxAssistantChars);
    if (kept.length && total + c.length > LIMITS.maxHistoryChars) break;
    total += c.length;
    kept.unshift({ role: m.role, content: c });
  }
  while (kept.length && kept[0]!.role !== 'user') kept.shift();
  const sys: ChatMessage[] = [{ role: 'system', content: system }];
  if (extra) sys.push({ role: 'system', content: extra });
  return [...sys, ...kept];
}

/** Remove anything that looks like a key from text we might log or return (defence in depth). */
export function redact(s: string): string {
  const k = process.env.OPENROUTER_API_KEY;
  let out = s.replace(/sk-or-[\w-]{8,}/g, '[redacted]');
  if (k && k.length > 8) out = out.split(k).join('[redacted]');
  return out.slice(0, 300);
}

/** Short, non-secret status for an upstream error body, e.g. "429:day-cap" when the free daily quota is spent. */
export function classify(status: number, body: string): string {
  const b = body.toLowerCase();
  if (status === 429 && /per-day|per day|daily/.test(b)) return '429:day-cap';
  if (status === 429 && /per-min|per min|minute/.test(b)) return '429:minute-cap';
  if (status === 429) return '429:upstream';
  if (status === 402) return '402:credits';
  if (status === 404 && /no endpoints|not found|does not exist|not a valid model/.test(b)) return '404:model-gone';
  return String(status);
}

type Attempt = { model: string; status: number | string };
export interface OpenOpts { maxTokens?: number; temperature?: number; finalMarker?: RegExp }

const CUT = '\n\n*(The reply was cut off. Please ask again.)*';

/**
 * Opens a stream from the first model group that answers. Resolves with a ReadableStream of plain-text deltas
 * (already started: at least one text chunk arrived) and the model that served it, or null when every group failed.
 */
export async function openStream(messages: ChatMessage[], signal: AbortSignal, attempts: Attempt[], opts: OpenOpts = {}): Promise<{ stream: ReadableStream<Uint8Array>; model: string; leak?: boolean } | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) { attempts.push({ model: '-', status: 'no_key' }); return null; }
  const deadline = Date.now() + LIMITS.totalMs;
  for (const group of modelGroups()) {
    if (signal.aborted || Date.now() > deadline - 4000) break;
    if (Date.now() < dayCapUntil && !group.includes(ROUTER)) { attempts.push({ model: group.map((m) => m.split('/').pop()).join('|'), status: 'skip:day-cap' }); continue; }
    const label = group.map((m) => m.split('/').pop()).join('|');
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    let timer = setTimeout(() => ctl.abort(), LIMITS.connectMs);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); };
    try {
      const payload: Record<string, unknown> = {
        messages, stream: true, max_tokens: opts.maxTokens ?? LIMITS.maxTokens, temperature: opts.temperature ?? 0.4,
        reasoning: { effort: 'low', exclude: true },
      };
      if (group.length > 1) payload.models = group; else payload.model = group[0];
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'HTTP-Referer': process.env.APP_URL ?? 'https://101codecrafts.org', 'X-Title': '101 Codecrafts 101 AI' },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        let txt = ''; try { txt = (await res.text()).slice(0, 600); } catch { /* ignore */ }
        const st = classify(res.status, txt); if (st === '429:day-cap') dayCapUntil = nextUtcMidnight();
        attempts.push({ model: label, status: st }); cleanup(); continue;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const enc = new TextEncoder();
      let buf = '';
      const queue: string[] = [];
      let done = false; let served = '';
      const pump = async (): Promise<void> => {
        clearTimeout(timer); timer = setTimeout(() => ctl.abort(), LIMITS.idleMs);
        const { value, done: d } = await reader.read();
        if (d) { done = true; return; }
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') { done = true; return; }
          let j: { model?: string; choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>; error?: { code?: number | string; message?: string } };
          try { j = JSON.parse(data); } catch { continue; }
          if (j.error) throw new Error('upstream_error_' + classify(Number(j.error.code) || 0, String(j.error.message ?? '')));
          if (j.model && !served) served = j.model;
          const t = j.choices?.[0]?.delta?.content;
          if (t) queue.push(t);
          if (j.choices?.[0]?.finish_reason === 'error') throw new Error('upstream_error_finish');
        }
      };
      try { while (!queue.length && !done) await pump(); }
      catch (e) { attempts.push({ model: label, status: e instanceof Error && e.message.startsWith('upstream_error') ? e.message.replace('upstream_error_', 'err:') : ctl.signal.aborted ? 'timeout' : 'stream_error' }); cleanup(); try { await reader.cancel(); } catch { /* ignore */ } continue; }
      if (!queue.length) { attempts.push({ model: label, status: 'empty' }); cleanup(); continue; }
      const model = served || group[0]!;
      attempts.push({ model, status: 200 });
      // leak guard: read a little more if the first chunk is tiny, then decide
      let broke = false;
      while (queue.join('').length < 120 && !done && Date.now() < deadline) { try { await pump(); } catch { broke = true; break; } }
      if (looksLeaky(queue.join(''))) {
        while (!done && Date.now() < deadline && queue.join('').length < 20_000) { try { await pump(); } catch { break; } }
        const all = queue.splice(0).join('');
        const fin = extractFinal(all, opts.finalMarker);
        attempts[attempts.length - 1]!.status = fin ? '200:leak-trimmed' : '200:leak-replaced';
        cleanup(); try { await reader.cancel(); } catch { /* ignore */ }
        const text = fin ?? LEAK_FALLBACK;
        return { model, leak: true, stream: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(text)); c.close(); } }) };
      }
      const stream = new ReadableStream<Uint8Array>({
        async pull(c) {
          try {
            if (broke && !queue.length) { c.enqueue(enc.encode(CUT)); cleanup(); c.close(); return; }
            while (!queue.length && !done && Date.now() < deadline) await pump();
            if (queue.length) { c.enqueue(enc.encode(queue.splice(0).join(''))); return; }
            if (!done) c.enqueue(enc.encode(CUT));   // hit the overall deadline mid-reply
            cleanup(); c.close();
          } catch { try { c.enqueue(enc.encode(CUT)); } catch { /* ignore */ } cleanup(); c.close(); }
        },
        async cancel() { cleanup(); ctl.abort(); try { await reader.cancel(); } catch { /* ignore */ } },
      });
      return { stream, model };
    } catch {
      attempts.push({ model: label, status: ctl.signal.aborted ? 'timeout' : 'network' });
      cleanup();
    }
  }
  return null;
}

/** Non-streaming helper (used by Explain): collects the whole reply, max ~maxChars. */
export async function complete(messages: ChatMessage[], signal: AbortSignal, attempts: Attempt[], opts: OpenOpts & { maxChars?: number } = {}): Promise<{ text: string; model: string; leak?: boolean } | null> {
  const opened = await openStream(messages, signal, attempts, opts);
  if (!opened) return null;
  const r = opened.stream.getReader(); const dec = new TextDecoder(); let out = '';
  for (;;) { const { value, done } = await r.read(); if (done) break; out += dec.decode(value, { stream: true }); if (out.length > (opts.maxChars ?? 4000)) { try { await r.cancel(); } catch { /* ignore */ } break; } }
  return { text: out.trim(), model: opened.model, leak: opened.leak };
}

/* ------------------------------------------------------------------ rate limit (per IP, per instance) */
const hits = new Map<string, number[]>();
export const RATE = { perMinute: 6, perHour: 40 };
export function localLimit(ip: string, now = Date.now(), bucket = ''): boolean {
  const k = bucket + ip;
  const arr = (hits.get(k) ?? []).filter((t) => now - t < 3600_000);
  const lastMin = arr.filter((t) => now - t < 60_000).length;
  if (lastMin >= RATE.perMinute || arr.length >= RATE.perHour) { hits.set(k, arr); return false; }
  arr.push(now); hits.set(k, arr);
  if (hits.size > 5000) for (const key of hits.keys()) { hits.delete(key); if (hits.size < 4000) break; }
  return true;
}
