import 'server-only';
import { safeFetch } from '@/lib/ssrf';

/**
 * Metadata extraction for the "paste a link" catalogue and news images.
 * Order: provider special cases (YouTube/Vimeo oEmbed, GitHub API, Open
 * Library / Google Books by ISBN) → JSON-LD (Course, Book, VideoObject,
 * Product, Article) → OpenGraph → Twitter Card → <title>/<meta description>.
 */
export interface Unfurled {
  url: string;
  canonical_url: string;
  type: 'course' | 'book' | 'video' | 'article' | 'tool' | 'repo';
  title: string;
  description: string | null;
  image_source_url: string | null;
  site_name: string | null;
  favicon_url: string | null;
  author: string | null;
  provider: string | null;
  price_text: string | null;
  is_free: boolean | null;
  language: string | null;
  duration_text: string | null;
  rating: number | null;
  rating_count: number | null;
  isbn: string | null;
  tags: string[];
  raw: Record<string, unknown>;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
export function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else { const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/); id = m?.[2] ?? null; }
    }
    return id && YT_ID.test(id) ? id : null;
  } catch { return null; }
}
export function youtubePlaylistId(raw: string): string | null {
  try {
    const list = new URL(raw).searchParams.get('list');
    return list && /^(PL|UU|LL|FL|OL)[A-Za-z0-9_-]{10,40}$/.test(list) ? list : null;
  } catch { return null; }
}
export function isbnFrom(raw: string): string | null {
  const m = raw.replace(/-/g, '').match(/(?:isbn[=/:]?|\/)(97[89]\d{10}|\d{9}[\dX])\b/i);
  return m?.[1]?.toUpperCase() ?? null;
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
function meta(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content).slice(0, 2000) : null;
}
function linkHref(html: string, rel: RegExp): string | null {
  for (const tag of html.match(/<link[^>]+>/gi) ?? []) {
    const r = tag.match(/rel=["']([^"']+)["']/i)?.[1];
    if (r && rel.test(r)) return tag.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
  }
  return null;
}
function absolute(href: string | null, base: string): string | null {
  if (!href) return null;
  try { const u = new URL(href, base); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}

type Ld = Record<string, unknown>;
function jsonLd(html: string): Ld[] {
  const out: Ld[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v: unknown = JSON.parse(m[1] ?? '');
      const items = Array.isArray(v) ? v : (v as Ld)['@graph'] ? ((v as Ld)['@graph'] as Ld[]) : [v];
      for (const i of items) if (i && typeof i === 'object') out.push(i as Ld);
    } catch { /* ignore malformed */ }
  }
  return out;
}
const str = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, 2000) : null);
const ldName = (v: unknown): string | null => (typeof v === 'string' ? v : Array.isArray(v) ? ldName(v[0]) : v && typeof v === 'object' ? str((v as Ld).name) : null);

function provider(host: string): string | null {
  const map: Record<string, string> = { 'youtube.com': 'youtube', 'youtu.be': 'youtube', 'vimeo.com': 'vimeo', 'coursera.org': 'coursera', 'udemy.com': 'udemy',
    'edx.org': 'edx', 'freecodecamp.org': 'freecodecamp', 'github.com': 'github', 'openlibrary.org': 'openlibrary', 'books.google.com': 'googlebooks',
    'developer.mozilla.org': 'mdn', 'khanacademy.org': 'khanacademy', 'medium.com': 'medium', 'dev.to': 'devto' };
  const h = host.replace(/^www\./, '');
  return map[h] ?? Object.entries(map).find(([k]) => h.endsWith(`.${k}`))?.[1] ?? null;
}

async function jsonGet<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(5000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

function empty(url: string): Unfurled {
  return { url, canonical_url: url, type: 'article', title: url, description: null, image_source_url: null, site_name: null, favicon_url: null,
    author: null, provider: null, price_text: null, is_free: null, language: null, duration_text: null, rating: null, rating_count: null, isbn: null, tags: [], raw: {} };
}

export async function unfurl(rawUrl: string, keys: { githubToken?: string; googleBooksKey?: string } = {}): Promise<Unfurled> {
  const u = new URL(rawUrl);
  const prov = provider(u.hostname);
  const base = { ...empty(rawUrl), provider: prov };

  // --- YouTube / Vimeo via oEmbed (no API key) ---
  const yt = youtubeId(rawUrl);
  if (prov === 'youtube' && (yt || youtubePlaylistId(rawUrl))) {
    const o = await jsonGet<{ title: string; author_name: string; thumbnail_url: string }>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(rawUrl)}`);
    return { ...base, type: yt ? 'video' : 'course', title: o?.title ?? 'YouTube video', author: o?.author_name ?? null, site_name: 'YouTube',
      image_source_url: yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : o?.thumbnail_url ?? null, is_free: true,
      canonical_url: yt ? `https://www.youtube.com/watch?v=${yt}` : rawUrl, raw: { youtube_id: yt, playlist_id: youtubePlaylistId(rawUrl) } };
  }
  if (prov === 'vimeo') {
    const o = await jsonGet<{ title: string; author_name: string; thumbnail_url: string; duration: number; description: string }>(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(rawUrl)}`);
    if (o) return { ...base, type: 'video', title: o.title, author: o.author_name, image_source_url: o.thumbnail_url, description: o.description ?? null,
      duration_text: o.duration ? `${Math.round(o.duration / 60)} min` : null, site_name: 'Vimeo' };
  }

  // --- GitHub repos via the GitHub API ---
  const gh = prov === 'github' ? u.pathname.match(/^\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/?$/) : null;
  if (gh) {
    const r = await jsonGet<{ full_name: string; description: string; stargazers_count: number; owner: { login: string; avatar_url: string }; html_url: string; topics: string[]; language: string; license: { spdx_id: string } | null }>(
      `https://api.github.com/repos/${gh[1]}/${gh[2]}`, keys.githubToken ? { authorization: `Bearer ${keys.githubToken}` } : {});
    if (r) return { ...base, type: 'repo', title: r.full_name, description: r.description, author: r.owner.login, site_name: 'GitHub', canonical_url: r.html_url,
      image_source_url: `https://opengraph.githubassets.com/1/${r.full_name}`, tags: (r.topics ?? []).slice(0, 10), is_free: true, language: r.language,
      rating_count: r.stargazers_count, raw: { stars: r.stargazers_count, license: r.license?.spdx_id ?? null } };
  }

  // --- Books by ISBN: Open Library, then Google Books ---
  const isbn = isbnFrom(rawUrl);
  if (isbn) {
    const ol = await jsonGet<Record<string, { title: string; authors?: { name: string }[]; cover?: { large?: string }; publish_date?: string; url?: string }>>(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const b = ol?.[`ISBN:${isbn}`];
    if (b) return { ...base, type: 'book', title: b.title, author: b.authors?.map((a) => a.name).join(', ') ?? null, image_source_url: b.cover?.large ?? null,
      isbn, site_name: 'Open Library', provider: base.provider ?? 'openlibrary', raw: { publish_date: b.publish_date ?? null } };
    const gb = await jsonGet<{ items?: { volumeInfo: { title: string; authors?: string[]; description?: string; imageLinks?: { thumbnail?: string }; averageRating?: number; ratingsCount?: number; language?: string } ; accessInfo?: { embeddable?: boolean } }[] }>(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${keys.googleBooksKey ? `&key=${keys.googleBooksKey}` : ''}`);
    const v = gb?.items?.[0];
    if (v) return { ...base, type: 'book', title: v.volumeInfo.title, author: v.volumeInfo.authors?.join(', ') ?? null, description: v.volumeInfo.description ?? null,
      image_source_url: v.volumeInfo.imageLinks?.thumbnail?.replace(/^http:/, 'https:') ?? null, rating: v.volumeInfo.averageRating ?? null,
      rating_count: v.volumeInfo.ratingsCount ?? null, language: v.volumeInfo.language ?? null, isbn, site_name: 'Google Books', raw: { embeddable: v.accessInfo?.embeddable ?? false } };
  }

  // --- Generic HTML: JSON-LD → OpenGraph → Twitter → title ---
  const page = await safeFetch(rawUrl);
  const html = page.body;
  const lds = jsonLd(html);
  const pick = (types: string[]) => lds.find((l) => { const t = l['@type']; return (Array.isArray(t) ? t : [t]).some((x) => types.includes(String(x))); });
  const course = pick(['Course']); const book = pick(['Book']); const video = pick(['VideoObject']); const product = pick(['Product', 'SoftwareApplication']);
  const article = pick(['Article', 'NewsArticle', 'BlogPosting', 'TechArticle']);
  const ld = course ?? book ?? video ?? product ?? article;
  const offers = (ld?.offers ?? (course?.hasCourseInstance as Ld | undefined)?.offers) as Ld | Ld[] | undefined;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const agg = ld?.aggregateRating as Ld | undefined;
  const price = offer ? Number(offer.price ?? NaN) : NaN;
  const canonical = absolute(linkHref(html, /^canonical$/i), page.url) ?? absolute(meta(html, 'og:url'), page.url) ?? page.url;
  const type: Unfurled['type'] = course || ['coursera', 'udemy', 'edx', 'freecodecamp', 'khanacademy'].includes(prov ?? '') ? 'course'
    : book ? 'book' : video || meta(html, 'og:type')?.startsWith('video') ? 'video' : product ? 'tool' : 'article';
  return {
    ...base,
    url: rawUrl,
    canonical_url: canonical,
    type,
    title: (str(ld?.name) ?? str(ld?.headline) ?? meta(html, 'og:title') ?? meta(html, 'twitter:title') ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '') ?? rawUrl).slice(0, 300) || rawUrl,
    description: (str(ld?.description) ?? meta(html, 'og:description') ?? meta(html, 'twitter:description') ?? meta(html, 'description'))?.slice(0, 5000) ?? null,
    image_source_url: absolute(str(Array.isArray(ld?.image) ? (ld?.image as unknown[])[0] : (ld?.image as Ld | undefined)?.url ?? ld?.image) ?? meta(html, 'og:image') ?? meta(html, 'twitter:image'), page.url),
    site_name: meta(html, 'og:site_name') ?? ldName(ld?.provider) ?? ldName(ld?.publisher) ?? u.hostname.replace(/^www\./, ''),
    favicon_url: absolute(linkHref(html, /icon/i) ?? '/favicon.ico', page.url),
    author: ldName(ld?.author) ?? ldName(ld?.creator) ?? meta(html, 'author'),
    price_text: Number.isFinite(price) ? (price === 0 ? 'Free' : `${String(offer?.priceCurrency ?? '')} ${price}`.trim()) : null,
    is_free: Number.isFinite(price) ? price === 0 : null,
    language: str(ld?.inLanguage) ?? html.match(/<html[^>]+lang=["']([a-zA-Z-]{2,10})["']/i)?.[1] ?? null,
    duration_text: str(ld?.duration ?? ld?.timeRequired),
    rating: agg ? Math.min(5, Number(agg.ratingValue) || 0) || null : null,
    rating_count: agg ? Number(agg.ratingCount ?? agg.reviewCount) || null : null,
    isbn: str(book?.isbn),
    tags: (meta(html, 'keywords') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => s && s.length <= 40).slice(0, 10),
    raw: { jsonld_types: lds.map((l) => l['@type']).slice(0, 10), status: page.status, redirected: page.redirected },
  };
}

/** Normalised canonical URL used for dedupe (url_hash). */
export function normaliseUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = '';
  for (const p of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|ref_src)/i.test(p)) u.searchParams.delete(p);
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}
