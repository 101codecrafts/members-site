import 'server-only';
import { SYSTEM_PROMPT } from './knowledge.ts';

/**
 * 101 AI: OpenRouter FREE models only (ids ending ":free"), so the assistant costs $0.
 * The key is OPENROUTER_API_KEY (server-only env var). It is never logged, echoed or sent to the browser.
 * Models are tried in order; a model that is rate-limited, down or returns nothing hands over to the next.
 * Set ASSISTANT_MODELS (comma-separated) to override the list; non-":free" ids are dropped.
 */
export const DEFAULT_MODELS = ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-lightning:free'];
export const LIMITS = { maxInput: 600, maxHistory: 8, maxHistoryChars: 6000, maxTokens: 450, connectMs: 15_000, idleMs: 20_000, totalMs: 50_000 };

export function freeModels(): string[] {
  const env = (process.env.ASSISTANT_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = (env.length ? env : DEFAULT_MODELS).filter((m) => /^[\w.-]+\/[\w.:-]+:free$/.test(m));
  return list.length ? list : DEFAULT_MODELS;
}

export interface Msg { role: 'user' | 'assistant'; content: string }

/** Trim the conversation: last N turns, last message must be the user's, total chars capped. */
export function buildMessages(history: Msg[]) {
  const h = history.slice(-LIMITS.maxHistory);
  let total = 0;
  const kept: Msg[] = [];
  for (let i = h.length - 1; i >= 0; i--) {
    const m = h[i]!;
    const c = m.content.slice(0, m.role === 'user' ? LIMITS.maxInput : 1500);
    if (total + c.length > LIMITS.maxHistoryChars) break;
    total += c.length;
    kept.unshift({ role: m.role, content: c });
  }
  while (kept.length && kept[0]!.role !== 'user') kept.shift();
  return [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...kept];
}

/** Remove anything that looks like a key from text we might log or return (defence in depth). */
export function redact(s: string): string {
  const k = process.env.OPENROUTER_API_KEY;
  let out = s.replace(/sk-or-[\w-]{8,}/g, '[redacted]');
  if (k && k.length > 8) out = out.split(k).join('[redacted]');
  return out.slice(0, 300);
}

type Attempt = { model: string; status: number | string };

/**
 * Opens a stream from the first free model that answers. Resolves with a ReadableStream of plain-text deltas
 * (already started: at least one text chunk arrived) or null when every model failed.
 */
export async function openStream(messages: ReturnType<typeof buildMessages>, signal: AbortSignal, attempts: Attempt[]): Promise<{ stream: ReadableStream<Uint8Array>; model: string } | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) { attempts.push({ model: '-', status: 'no_key' }); return null; }
  const deadline = Date.now() + LIMITS.totalMs;
  for (const model of freeModels()) {
    if (signal.aborted || Date.now() > deadline - 3000) break;
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    let timer = setTimeout(() => ctl.abort(), LIMITS.connectMs);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'HTTP-Referer': process.env.APP_URL ?? 'https://101codecrafts.org', 'X-Title': '101 Codecrafts 101 AI' },
        body: JSON.stringify({ model, messages, stream: true, max_tokens: LIMITS.maxTokens, temperature: 0.3, reasoning: { exclude: true } }),
      });
      if (!res.ok || !res.body) { attempts.push({ model, status: res.status }); clearTimeout(timer); signal.removeEventListener('abort', onAbort); try { await res.body?.cancel(); } catch { /* ignore */ } continue; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const enc = new TextEncoder();
      let buf = '';
      const queue: string[] = [];
      let done = false;
      // pull SSE lines until we have text (or the stream ends / errors)
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
          try {
            const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; error?: { code?: number | string } };
            if (j.error) throw new Error('upstream_error_' + String(j.error.code ?? ''));
            const t = j.choices?.[0]?.delta?.content;
            if (t) queue.push(t);
          } catch (e) { if (e instanceof Error && e.message.startsWith('upstream_error')) throw e; }
        }
      };
      try { while (!queue.length && !done) await pump(); }
      catch (e) { attempts.push({ model, status: e instanceof Error && e.message.startsWith('upstream_error') ? e.message : 'stream_error' }); clearTimeout(timer); signal.removeEventListener('abort', onAbort); try { await reader.cancel(); } catch { /* ignore */ } continue; }
      if (!queue.length) { attempts.push({ model, status: 'empty' }); clearTimeout(timer); signal.removeEventListener('abort', onAbort); continue; }
      attempts.push({ model, status: 200 });
      const stream = new ReadableStream<Uint8Array>({
        async pull(c) {
          try {
            while (!queue.length && !done && Date.now() < deadline) await pump();
            if (queue.length) { c.enqueue(enc.encode(queue.splice(0).join(''))); return; }
            clearTimeout(timer); signal.removeEventListener('abort', onAbort); c.close();
          } catch { clearTimeout(timer); signal.removeEventListener('abort', onAbort); c.close(); }
        },
        async cancel() { clearTimeout(timer); signal.removeEventListener('abort', onAbort); ctl.abort(); try { await reader.cancel(); } catch { /* ignore */ } },
      });
      return { stream, model };
    } catch (e) {
      attempts.push({ model, status: ctl.signal.aborted ? 'timeout' : 'network' });
      clearTimeout(timer); signal.removeEventListener('abort', onAbort);
    }
  }
  return null;
}

/* ------------------------------------------------------------------ rate limit (per IP, per instance) */
const hits = new Map<string, number[]>();
export const RATE = { perMinute: 6, perHour: 40 };
export function localLimit(ip: string, now = Date.now()): boolean {
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  const lastMin = arr.filter((t) => now - t < 60_000).length;
  if (lastMin >= RATE.perMinute || arr.length >= RATE.perHour) { hits.set(ip, arr); return false; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); if (hits.size < 4000) break; }
  return true;
}
