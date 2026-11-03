import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, preflight, body } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { AppError } from '@/lib/errors';
import { buildMessages, localLimit, openStream, LIMITS, redact } from '@/lib/assistant/chat';
import { WA_INVITE } from '@/lib/assistant/knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })).min(1).max(20),
});

const BUSY = `101 AI is busy right now (the free AI models are at their limit). Please try again in a few minutes, or ask in the [WhatsApp community](${WA_INVITE}).`;
const SLOW_DOWN = 'You are sending messages a little fast. Please wait a minute and try again.';

/**
 * POST /api/v1/assistant: the floating "101 AI" site assistant. Public (no sign-in), answers only about
 * 101 Codecrafts from lib/assistant/knowledge.ts. Free OpenRouter models only. Streams text/plain deltas.
 * Errors are JSON { error: { code, message } } with a friendly message the widget shows as-is.
 */
export const POST = route(async ({ req, ip, log }) => {
  const b = await body(req, schema);
  const last = b.messages[b.messages.length - 1]!;
  if (last.role !== 'user') throw new AppError('bad_request', 'The last message must be from the user');
  if (last.content.length > LIMITS.maxInput) throw new AppError('bad_request', `Please keep your question under ${LIMITS.maxInput} characters.`);
  if (!localLimit(ip)) return NextResponse.json({ error: { code: 'rate_limited', message: SLOW_DOWN } }, { status: 429, headers: { 'retry-after': '60' } });
  try { await rateLimit({ name: 'assistant', max: 30, windowSeconds: 600 }, ip); }
  catch (e) { if (e instanceof AppError && e.code === 'rate_limited') return NextResponse.json({ error: { code: 'rate_limited', message: SLOW_DOWN } }, { status: 429, headers: { 'retry-after': '120' } }); }

  const attempts: Array<{ model: string; status: number | string }> = [];
  const opened = await openStream(buildMessages(b.messages), req.signal, attempts);
  log.info('assistant', { attempts: attempts.map((a) => `${a.model}:${redact(String(a.status))}`).join(','), q_len: last.content.length });
  // x-assistant-attempts: "model:status" per free model tried (statuses only, never the key) for ops debugging.
  const tried = attempts.map((a) => `${a.model.split('/').pop()}:${redact(String(a.status))}`).join(',').slice(0, 300);
  if (!opened) return NextResponse.json({ error: { code: 'busy', message: BUSY } }, { status: 503, headers: { 'retry-after': '120', 'x-assistant-attempts': tried } });
  return new Response(opened.stream, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', 'x-assistant-model': opened.model, 'x-assistant-attempts': tried },
  });
});
export const OPTIONS = preflight;
