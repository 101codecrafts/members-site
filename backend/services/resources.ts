import 'server-only';
import type { Session } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { unfurl, normaliseUrl, youtubeId, youtubePlaylistId, isbnFrom, type Unfurled } from '@/lib/unfurl';
import { safeFetch, assertSafeUrl } from '@/lib/ssrf';
import { sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import type { Logger } from '@/lib/logger';

/** Downloads an image through the SSRF guard and re-hosts it in a public bucket. */
export async function rehostImage(src: string | null, bucket: 'resource-thumbs', keyPrefix: string): Promise<string | null> {
  if (!src) return null;
  try {
    assertSafeUrl(src);
    const res = await safeFetch(src, { accept: /^image\/(png|jpe?g|webp|gif)/i, maxBytes: 2 * 1024 * 1024 });
    const ext = res.contentType.includes('png') ? 'png' : res.contentType.includes('webp') ? 'webp' : res.contentType.includes('gif') ? 'gif' : 'jpg';
    const path = `${keyPrefix}.${ext}`;
    const bytes = Buffer.from(res.body, 'binary');
    // safeFetch decodes as utf8 for HTML; fetch raw bytes for images
    const raw = await fetch(res.url, { signal: AbortSignal.timeout(5000) }).then((r) => r.arrayBuffer()).catch(() => bytes);
    const db = serviceClient();
    const up = await db.storage.from(bucket).upload(path, raw, { contentType: res.contentType.split(';')[0], upsert: true });
    if (up.error) return null;
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export async function unfurlUrl(url: string): Promise<Unfurled> {
  const e = env();
  return unfurl(url, { githubToken: e.GITHUB_TOKEN, googleBooksKey: e.GOOGLE_BOOKS_API_KEY });
}

/**
 * Paste-a-link: unfurl server-side, dedupe by canonical URL hash, re-host the
 * thumbnail, then INSERT AS THE USER (RLS: tutors/admins only) as a draft
 * the tutor/admin can edit before publishing.
 */
export async function createResourceFromUrl(s: Session, url: string, opts: { learning_path_id?: string; course_id?: string }, log: Logger) {
  const meta = await unfurlUrl(url);
  const canonical = normaliseUrl(meta.canonical_url || url);
  const hash = sha256(canonical);
  const existing = (await s.db.from('external_resources').select('id, status').eq('url_hash', hash).maybeSingle()).data;
  if (existing) throw new AppError('conflict', `Already in the catalogue (${existing.id})`);
  const image = await rehostImage(meta.image_source_url, 'resource-thumbs', hash.slice(0, 32));
  const { data, error } = await s.db.from('external_resources').insert({
    url, canonical_url: canonical, url_hash: hash, type: meta.type, title: meta.title, description: meta.description,
    image_url: image, image_source_url: meta.image_source_url, site_name: meta.site_name, favicon_url: meta.favicon_url, author: meta.author,
    provider: meta.provider, price_text: meta.price_text, is_free: meta.is_free, language: meta.language, duration_text: meta.duration_text,
    rating: meta.rating, rating_count: meta.rating_count, isbn: meta.isbn, tags: meta.tags, raw_metadata: meta.raw as never,
    learning_path_id: opts.learning_path_id ?? null, course_id: opts.course_id ?? null, status: 'draft', last_fetched_at: new Date().toISOString(),
  }).select('*').single();
  if (error) throw error;
  log.info('resource_created', { id: data.id, provider: meta.provider, type: meta.type });
  return data;
}

/** Course media: parse YouTube ids with strict regexes, enrich via oEmbed / ISBN lookups. */
export async function buildCourseMedia(url: string, kindHint?: string) {
  const vid = youtubeId(url);
  const list = youtubePlaylistId(url);
  const isbn = isbnFrom(url);
  const kind = kindHint ?? (vid ? 'youtube_video' : list ? 'youtube_playlist' : isbn ? 'book' : 'article');
  const meta = await unfurlUrl(url).catch(() => null);
  const provider_id = kind === 'youtube_video' ? vid : kind === 'youtube_playlist' ? list : kind === 'book' ? (isbn ?? meta?.isbn ?? null) : null;
  if ((kind === 'youtube_video' && !vid) || (kind === 'youtube_playlist' && !list)) throw new AppError('bad_request', 'Not a valid YouTube URL');
  return {
    kind, provider_id, source_url: kind === 'youtube_video' ? `https://www.youtube.com/watch?v=${vid}` : url,
    title: meta?.title ?? url, channel: kind.startsWith('youtube') ? meta?.author ?? null : null, author: kind === 'book' ? meta?.author ?? null : null,
    thumbnail_url: meta?.image_source_url ?? null, embeddable: kind !== 'book' || Boolean((meta?.raw as { embeddable?: boolean } | undefined)?.embeddable),
    // Player: https://www.youtube-nocookie.com/embed/{id}?enablejsapi=1 (official IFrame API)
    embed_url: vid ? `https://www.youtube-nocookie.com/embed/${vid}?enablejsapi=1&rel=0` : list ? `https://www.youtube-nocookie.com/embed/videoseries?list=${list}` : null,
  };
}

/** Weekly link checker (cron, service role). */
export async function checkLinks(limit: number, log: Logger) {
  const db = serviceClient();
  const rows = (await db.from('external_resources').select('id, url').eq('status', 'published').order('last_checked_at', { ascending: true, nullsFirst: true }).limit(limit)).data ?? [];
  let dead = 0;
  for (const r of rows) {
    let status: 'ok' | 'redirected' | 'dead' = 'ok';
    try {
      const res = await safeFetch(r.url, { method: 'HEAD', accept: /.*/ });
      if (res.status >= 400 && res.status !== 405 && res.status !== 403) status = 'dead';
      else if (res.redirected) status = 'redirected';
    } catch { status = 'dead'; }
    if (status === 'dead') dead++;
    await db.from('external_resources').update({ link_status: status, last_checked_at: new Date().toISOString() }).eq('id', r.id);
  }
  log.info('link_check', { checked: rows.length, dead });
  return { checked: rows.length, dead };
}
