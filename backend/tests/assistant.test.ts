// 101 AI assistant: free-model fallback, streaming, limits, key redaction (no network: fetch is mocked).
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.OPENROUTER_API_KEY = 'sk-or-v1-TESTKEY-not-real-0000';
const { openStream, buildMessages, localLimit, redact, freeModels, LIMITS } = await import('../lib/assistant/chat.ts');
const { SYSTEM_PROMPT } = await import('../lib/assistant/knowledge.ts');
const sse = (parts: string[]) => new Response(new ReadableStream({ start(c) { for (const p of parts) c.enqueue(new TextEncoder().encode(p)); c.close(); } }), { status: 200 });
const read = async (s: ReadableStream<Uint8Array>) => { let o = ''; const r = s.getReader(); for (;;) { const { value, done } = await r.read(); if (done) return o; o += new TextDecoder().decode(value); } };

test('only :free models are used', () => {
  process.env.ASSISTANT_MODELS = 'openai/gpt-4o, meta-llama/llama-3.3-70b-instruct:free';
  assert.deepEqual(freeModels(), ['meta-llama/llama-3.3-70b-instruct:free']);
  process.env.ASSISTANT_MODELS = 'openai/gpt-4o';
  assert.ok(freeModels().every((m) => m.endsWith(':free')));
  delete process.env.ASSISTANT_MODELS;
  assert.ok(freeModels().length >= 2 && freeModels().every((m) => m.endsWith(':free')));
});
test('falls back past 429 and empty streams, streams text', async () => {
  const seen: string[] = []; const orig = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, init: { body: string; headers: Record<string, string> }) => {
    const m = JSON.parse(init.body).model as string; seen.push(m);
    assert.ok(m.endsWith(':free')); assert.equal(JSON.parse(init.body).max_tokens, LIMITS.maxTokens);
    if (seen.length === 1) return new Response('rate limited', { status: 429 });
    if (seen.length === 2) return sse([': OPENROUTER PROCESSING\n\n', 'data: [DONE]\n\n']);
    return sse(['data: {"choices":[{"delta":{"content":"Hel"}}]}\n', '\ndata: {"choices":[{"delta":{"con', 'tent":"lo"}}]}\n\ndata: [DONE]\n\n']);
  }) as typeof fetch;
  const att: Array<{ model: string; status: number | string }> = [];
  const r = await openStream(buildMessages([{ role: 'user', content: 'hi' }]), new AbortController().signal, att);
  globalThis.fetch = orig;
  assert.ok(r); assert.equal(await read(r!.stream), 'Hello'); assert.equal(att.length, 3);
});
test('all models failing returns null', async () => {
  const orig = globalThis.fetch; globalThis.fetch = (async () => new Response('x', { status: 503 })) as typeof fetch;
  const att: Array<{ model: string; status: number | string }> = [];
  assert.equal(await openStream(buildMessages([{ role: 'user', content: 'hi' }]), new AbortController().signal, att), null);
  globalThis.fetch = orig;
});
test('history trimmed, system prompt first, starts with user', () => {
  const long = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: 'x'.repeat(2000) }));
  const m = buildMessages(long);
  assert.equal(m[0]!.role, 'system'); assert.equal(m[0]!.content, SYSTEM_PROMPT); assert.equal(m[1]!.role, 'user');
  assert.ok(m.slice(1).reduce((n, x) => n + x.content.length, 0) <= LIMITS.maxHistoryChars);
});
test('per-IP limit and key redaction', () => {
  let ok = 0; for (let i = 0; i < 20; i++) if (localLimit('9.9.9.9')) ok++;
  assert.equal(ok, 6);
  assert.ok(!redact('boom sk-or-v1-TESTKEY-not-real-0000 sk-or-v1-abcdefghijk').includes('sk-or'));
});
test('knowledge keeps placeholders as unknown and has the real facts', () => {
  for (const s of ['Kampala, Uganda', 'Start at 101. Craft your way up.', 'Businge Daglous', 'Ngabirano Octavious', 'Mwesigwa Allan', 'privacy@101codecrafts.org', '101 Pro', 'Free Courses Worldwide', 'chat.whatsapp.com']) assert.ok(SYSTEM_PROMPT.includes(s), s);
  assert.ok(!/10,000|10K/.test(SYSTEM_PROMPT));
});
