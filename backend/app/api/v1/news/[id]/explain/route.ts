import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, preflight, body } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { AppError } from '@/lib/errors';
import { anonClient } from '@/lib/supabase/user';
import { buildMessages, complete, localLimit, redact, aiFailure, AI_UNAVAILABLE } from '@/lib/assistant/chat';
import { EXPLAIN_PROMPT } from '@/lib/assistant/knowledge';
import { fetchPage, wrapUntrusted, PageError, checkUrl } from '@/lib/assistant/fetch-page';
import { cleanExplanation } from '@/lib/assistant/safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({ title: z.string().min(1).max(300), url: z.string().max(2000).optional().nullable() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Per-instance cache: one explanation per article URL for 6 h, so a popular story costs one free-model request. */
const cache = new Map<string, { at: number; v: { explanation: string; model: string; source: string; read: boolean } }>();
const TTL = 6 * 3600_000;

/**
 * POST /api/v1/news/:id/explain  ←  {title, url}  →  {explanation, model, source, read}
 * ("Explain with 101 AI" on the news page; contract in js/feed-api.js). Public, rate-limited, free models only.
 * For a news_items id (uuid) the URL and title come from the database, not the request. For live-feed items
 * (Hacker News / Dev.to ids) the client URL is used, behind the SSRF guard. The article text is fetched
 * server-side and handed to the model as UNTRUSTED data; the reply is cleaned to plain text with no links
 * except the source itself.
 */
export const POST = route<{ id: string }>(async ({ req, params, ip, log }) => {
  const b = await body(req, schema);
  let title = b.title.trim(); let url = (b.url ?? '').trim();
  const id = String(params.id ?? '').slice(0, 120);
  if (UUID.test(id)) {
    const r = await anonClient().from('news_items').select('title, url').eq('id', id).maybeSingle();
    const row = r.data as { title?: string; url?: string } | null;
    if (row?.url) { url = row.url; title = row.title || title; }
  }
  if (url) { try { checkUrl(url); } catch { url = ''; } }
  const key = url || 'title:' + title.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ data: { ...hit.v, cached: true }, ...hit.v, cached: true }, { headers: { 'x-assistant-model': hit.v.model, 'x-explain-cache': 'hit' } });

  if (!localLimit(ip, Date.now(), 'explain:')) return NextResponse.json({ error: { code: 'rate_limited', message: 'You are asking a little fast. Please wait a minute, then try Explain again.' } }, { status: 429, headers: { 'retry-after': '60' } });
  try { await rateLimit({ name: 'assistant', max: 30, windowSeconds: 600 }, ip); }
  catch (e) { if (e instanceof AppError && e.code === 'rate_limited') return NextResponse.json({ error: { code: 'rate_limited', message: 'You are asking a little fast. Please wait a few minutes, then try Explain again.' } }, { status: 429, headers: { 'retry-after': '120' } }); }

  let article = ''; let read = false; let why = 'no_url';
  if (url) {
    try { const p = await fetchPage(url); article = (p.title ? `Title: ${p.title}\n\n` : '') + p.text.slice(0, 9000); read = true; why = 'ok'; }
    catch (e) { why = e instanceof PageError ? e.reason : 'error'; }
  }
  const { block } = wrapUntrusted(article || '(The article could not be read. Only the headline is available.)', url || 'headline only');
  const user = `Headline: ${title}\nSource: ${url || 'unknown'}\n\n${block}\n\nExplain this story for a learner.`;
  const attempts: Array<{ model: string; status: number | string }> = [];
  const out = await complete(buildMessages([{ role: 'user', content: user }], undefined, EXPLAIN_PROMPT), req.signal, attempts, { maxTokens: 900, temperature: 0.3, maxChars: 2500, finalMarker: /In simple words:/i });
  const tried = attempts.map((a) => `${a.model.split('/').pop()}:${redact(String(a.status))}`).join(',').slice(0, 300);
  log.info('news_explain', { attempts: tried, read, why });
  if (!out || out.text.length < 20 || (out.leak && (!/^In simple words:/i.test(out.text) || /2[–-]4 (short )?(sentences|bullets)|UNTRUSTED/i.test(out.text)))) {
    // Machine codes (round 12 QA): 'ai_quota' (+ resets_at) only for the real free daily cap; 'ai_unavailable' otherwise
    // (including a reply rejected by the leak guard: a model answered, so the quota is not the reason).
    const f = out ? { code: 'ai_unavailable' as const } : aiFailure(attempts);
    const err = f.code === 'ai_quota'
      ? { code: f.code, resets_at: f.resets_at, message: "101 AI has used today's free AI allowance (it resets at 03:00 Kampala time). Open the source to read the story." }
      : { code: f.code, message: AI_UNAVAILABLE };
    return NextResponse.json({ error: err }, { status: 503, headers: { 'retry-after': '60', 'x-assistant-attempts': tried } });
  }
  const v = { explanation: cleanExplanation(out.text, url), model: out.model, source: url, read };
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 500) for (const k of cache.keys()) { cache.delete(k); if (cache.size < 400) break; }
  return NextResponse.json({ data: v, ...v }, { headers: { 'x-assistant-model': out.model, 'x-assistant-attempts': tried, 'x-explain-read': why } });
});
export const OPTIONS = preflight;
