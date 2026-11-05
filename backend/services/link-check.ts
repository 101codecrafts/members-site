import 'server-only';
import { env } from '@/lib/env';
import { serviceClient } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/logger';
import { combine, maxLevel, staticUrlRisk, type RiskFlag, type UrlRisk } from '@/lib/link-risk';

/**
 * Round 11 approval queue link checks. Runs server-side after a submission:
 *   1. static checks (lib/link-risk.ts, no network)
 *   2. YouTube oEmbed for YouTube links: 200 = public + embeddable, 401 = private / embedding off, 404 = gone
 *   3. Google Web Risk Lookup (WEB_RISK_API_KEY) or Safe Browsing v4 (SAFE_BROWSING_API_KEY); with neither key every
 *      URL carries 'not_scanned' (medium) so an admin never mistakes "unchecked" for "safe"
 * The verdict is written with backend_set_submission_risk (service role). Only fixed provider hosts are fetched,
 * never the submitted URL itself (no SSRF surface).
 */
const log = createLogger({ mod: 'link-check' });
const THREATS = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'];

async function fetchJson(url: string, init: RequestInit = {}, ms = 4000): Promise<{ status: number; json: unknown }> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, redirect: 'manual', cache: 'no-store' });
    let json: unknown = null;
    try { json = await r.json(); } catch { /* not json */ }
    return { status: r.status, json };
  } finally { clearTimeout(t); }
}

export async function youtubeOEmbed(videoUrl: string): Promise<RiskFlag> {
  try {
    const { status, json } = await fetchJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`);
    if (status === 200 && json && typeof json === 'object') return { code: 'youtube_ok', level: 'low', detail: String((json as { title?: string }).title ?? '').slice(0, 120) };
    if (status === 401 || status === 403) return { code: 'youtube_private', level: 'high', detail: 'private or embedding disabled' };
    if (status === 404 || status === 400) return { code: 'youtube_missing', level: 'high', detail: 'video not found' };
    return { code: 'youtube_unverified', level: 'medium', detail: `oEmbed ${status}` };
  } catch {
    return { code: 'youtube_unverified', level: 'medium', detail: 'oEmbed unreachable' };
  }
}

/** url → threat types (empty = clean). null = not scanned (no key or provider error). */
export async function reputation(urls: string[]): Promise<Map<string, string[]> | null> {
  const e = env();
  const out = new Map<string, string[]>();
  if (e.WEB_RISK_API_KEY) {
    try {
      for (const u of urls.slice(0, 50)) {
        const q = new URLSearchParams({ uri: u, key: e.WEB_RISK_API_KEY });
        for (const t of THREATS) q.append('threatTypes', t);
        const { status, json } = await fetchJson(`https://webrisk.googleapis.com/v1/uris:search?${q}`);
        if (status !== 200) throw new Error(`web risk ${status}`);
        out.set(u, ((json as { threat?: { threatTypes?: string[] } })?.threat?.threatTypes) ?? []);
      }
      return out;
    } catch (err) { log.warn('web risk failed', { error: String(err) }); return null; }
  }
  if (e.SAFE_BROWSING_API_KEY) {
    try {
      const { status, json } = await fetchJson(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(e.SAFE_BROWSING_API_KEY)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client: { clientId: '101codecrafts', clientVersion: '11' },
          threatInfo: { threatTypes: THREATS, platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: urls.slice(0, 500).map((url) => ({ url })) } }),
      });
      if (status !== 200) throw new Error(`safe browsing ${status}`);
      for (const u of urls) out.set(u, []);
      for (const m of ((json as { matches?: { threatType: string; threat: { url: string } }[] })?.matches ?? [])) out.set(m.threat.url, [...(out.get(m.threat.url) ?? []), m.threatType]);
      return out;
    } catch (err) { log.warn('safe browsing failed', { error: String(err) }); return null; }
  }
  return null;
}

async function listsFromSettings(): Promise<{ allow: string[]; deny: string[] }> {
  const db = serviceClient();
  const rows = (await db.from('site_settings').select('key, value').in('key', ['links.allow', 'links.deny'])).data ?? [];
  const get = (k: string) => { const v = rows.find((r) => r.key === k)?.value; return Array.isArray(v) ? v.map(String) : []; };
  return { allow: get('links.allow'), deny: get('links.deny') };
}

export async function checkUrls(urls: string[]): Promise<{ level: UrlRisk['level']; flags: (RiskFlag & { url: string })[] }> {
  const lists = await listsFromSettings().catch(() => ({ allow: [], deny: [] }));
  const results = urls.slice(0, 50).map((u) => staticUrlRisk(u, lists));
  await Promise.all(results.filter((r) => r.youtubeId).map(async (r) => {
    const f = await youtubeOEmbed(r.url); r.flags.push(f); r.level = maxLevel(r.level, f.level);
  }));
  const scannable = results.filter((r) => r.level !== 'blocked' && r.host).map((r) => r.url);
  const rep = scannable.length ? await reputation(scannable) : new Map<string, string[]>();
  for (const r of results) {
    if (r.level === 'blocked' || !r.host) continue;
    const threats = rep?.get(r.url);
    if (rep === null) { r.flags.push({ code: 'not_scanned', level: 'medium', detail: 'no Web Risk / Safe Browsing key configured or provider unreachable' }); r.level = maxLevel(r.level, 'medium'); }
    else if (threats && threats.length) { r.flags.push({ code: 'reputation', level: 'blocked', detail: threats.join(', ') }); r.level = 'blocked'; }
  }
  return combine(results);
}

/** Check a submission's URLs and store the verdict (service role). Never throws into the caller. */
export async function checkSubmission(id: string): Promise<{ level: string; flags: unknown[] } | null> {
  try {
    const db = serviceClient();
    const row = (await db.from('review_submissions').select('id, urls').eq('id', id).maybeSingle()).data as { id: string; urls: string[] } | null;
    if (!row) return null;
    const v = await checkUrls(row.urls ?? []);
    const call = db.rpc as unknown as (n: string, a: object) => Promise<{ error: { message: string } | null }>;
    const { error } = await call.call(db, 'backend_set_submission_risk', { p_id: id, p_level: v.level, p_flags: v.flags });
    if (error) throw new Error(error.message);
    return v;
  } catch (err) {
    log.warn('checkSubmission failed', { id, error: String(err) });
    return null;
  }
}
