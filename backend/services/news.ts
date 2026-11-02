import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import { fetchAllSources, aiSummary, type RawNews } from '@/lib/news';
import { normaliseUrl } from '@/lib/unfurl';
import { sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import { rpc } from '@/repositories/rpc';
import { rehostImage, unfurlUrl } from '@/services/resources';
import type { Logger } from '@/lib/logger';

/**
 * Daily (05:00 EAT) full ingest + light refresh (GitHub Actions hourly).
 * Dedupe: canonical-URL hash (unique) + pg_trgm title similarity ≥ 0.8.
 */
export async function ingestNews(light: boolean, log: Logger) {
  const e = env();
  const db = serviceClient();
  const raw = await fetchAllSources({ githubToken: e.GITHUB_TOKEN, light });
  let inserted = 0, skipped = 0;
  const seen = new Set<string>();
  for (const n of raw.sort((a, b) => b.score - a.score)) {
    try {
      const canonical = normaliseUrl(n.url);
      const hash = sha256(canonical);
      if (seen.has(hash)) { skipped++; continue; }
      seen.add(hash);
      const dupe = (await db.from('news_items').select('id').eq('url_hash', hash).maybeSingle()).data;
      if (dupe || (await rpc(db, 'news_title_exists', { p_title: n.title }))) { skipped++; continue; }
      const image = await enrichImage(n, hash);
      const summary = await aiSummary(e.AI_GATEWAY_API_KEY, e.AI_MODEL, n.title, n.summary);
      const { error } = await db.from('news_items').insert({ source: n.source, url: canonical, url_hash: hash, title: n.title.slice(0, 300),
        summary: n.summary?.slice(0, 1000) ?? null, ai_summary: summary, image_url: image, author: n.author?.slice(0, 200) ?? null,
        category: n.category, score: n.score, published_at: n.published_at });
      if (error && error.code !== '23505') throw error;
      if (!error) inserted++;
    } catch (err) {
      log.warn('news_item_failed', { source: n.source, err: err instanceof Error ? err.message : String(err) });
    }
  }
  log.info('news_ingest', { light, fetched: raw.length, inserted, skipped });
  return { fetched: raw.length, inserted, skipped };
}

async function enrichImage(n: RawNews, hash: string): Promise<string | null> {
  const src = n.image_url ?? (await unfurlUrl(n.url).then((m) => m.image_source_url).catch(() => null));
  return (await rehostImage(src, 'resource-thumbs', `news/${hash.slice(0, 32)}`)) ?? null;
}
