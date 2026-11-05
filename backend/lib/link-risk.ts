/**
 * Static URL risk checks for the admin approval queue (round 11). Pure: no
 * network, no env, so it is unit-tested directly (tests/link-risk.test.ts).
 * Network checks (YouTube oEmbed, Google Web Risk / Safe Browsing) live in
 * services/link-check.ts and add their flags on top of these.
 *
 * Levels: low < medium < high < blocked. "blocked" can never be approved.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';
export interface RiskFlag { code: string; level: RiskLevel; detail?: string }
export interface UrlRisk { url: string; host: string | null; level: RiskLevel; flags: RiskFlag[]; youtubeId: string | null }

const ORDER: RiskLevel[] = ['low', 'medium', 'high', 'blocked'];
export const maxLevel = (...l: RiskLevel[]): RiskLevel => l.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'low' as RiskLevel);

/** Education / dev domains that start at low risk (admins extend it via site_settings `links.allow`). */
export const DEFAULT_ALLOW = [
  'youtube.com', 'youtu.be', 'github.com', 'gitlab.com', 'coursera.org', 'freecodecamp.org', 'khanacademy.org', 'edx.org', 'udemy.com',
  'developer.mozilla.org', 'learn.microsoft.com', 'docs.python.org', 'w3schools.com', 'stackoverflow.com', 'wikipedia.org', 'kaggle.com',
  'huggingface.co', 'google.com', 'cloud.google.com', 'developers.google.com', 'aws.amazon.com', 'mit.edu', 'harvard.edu', 'cs50.harvard.edu',
  'docs.github.com', 'npmjs.com', 'pypi.org', 'books.google.com', 'archive.org', 'openlibrary.org', '101codecrafts.org', 'vercel.app',
];
export const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'lnkd.in', 's.id', 'v.gd'];
/** TLDs with a high share of abuse in public phishing feeds; flagged medium, never auto-blocked. */
export const RISKY_TLDS = ['zip', 'mov', 'xyz', 'top', 'click', 'link', 'work', 'country', 'gq', 'tk', 'ml', 'cf', 'ga', 'buzz', 'rest', 'fit', 'loan', 'cam'];
const EXEC_EXT = /\.(exe|msi|bat|cmd|scr|apk|jar|dmg|pkg|vbs|ps1|sh|iso|dll|com)$/i;
const ARCHIVE_EXT = /\.(zip|rar|7z|tar|gz|tgz)$/i;

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);

/** 11-char YouTube video id from watch / youtu.be / shorts / embed / live URLs, else null. */
export function youTubeId(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const h = u.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, '');
  let id: string | null = null;
  if (h === 'youtu.be') id = u.pathname.split('/')[1] || null;
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/); id = m?.[1] ?? null; }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function staticUrlRisk(raw: string, opts: { allow?: string[]; deny?: string[] } = {}): UrlRisk {
  const flags: RiskFlag[] = [];
  const add = (code: string, level: RiskLevel, detail?: string) => flags.push({ code, level, ...(detail ? { detail } : {}) });
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch {
    return { url: String(raw), host: null, level: 'blocked', flags: [{ code: 'invalid_url', level: 'blocked' }], youtubeId: null };
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const allow = [...DEFAULT_ALLOW, ...(opts.allow ?? [])].map((d) => d.toLowerCase());
  const deny = (opts.deny ?? []).map((d) => d.toLowerCase());

  if (!['http:', 'https:'].includes(u.protocol)) add('scheme', 'blocked', u.protocol);
  else if (u.protocol === 'http:') add('not_https', 'medium');
  if (u.username || u.password) add('credentials_in_url', 'high');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) add('ip_host', 'high', host);
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) add('private_host', 'blocked', host);
  if (host.split('.').some((l) => l.startsWith('xn--'))) add('punycode', 'high', host);
  if (/[^\x00-\x7F]/.test(raw)) add('non_ascii', 'medium');
  if (u.port && !['80', '443'].includes(u.port)) add('odd_port', 'medium', u.port);
  if (SHORTENERS.some((d) => hostMatches(host, d))) add('shortener', 'high', 'hides the real destination');
  const tld = host.split('.').pop() ?? '';
  if (RISKY_TLDS.includes(tld)) add('risky_tld', 'medium', '.' + tld);
  if (EXEC_EXT.test(u.pathname)) add('executable_download', 'high', u.pathname.split('/').pop());
  else if (ARCHIVE_EXT.test(u.pathname)) add('archive_download', 'medium', u.pathname.split('/').pop());
  if (raw.length > 2000) add('very_long', 'medium', String(raw.length));
  if ((raw.match(/%[0-9a-f]{2}/gi) ?? []).length > 20) add('heavily_encoded', 'medium');
  if (host.split('.').length > 5) add('deep_subdomain', 'medium', host);
  if (/(login|signin|verify|wallet|account|secure|update)[-.]/i.test(host) && !allow.some((d) => hostMatches(host, d))) add('lure_words', 'medium', host);
  if (deny.some((d) => hostMatches(host, d))) add('denylisted', 'blocked', host);

  const allowed = allow.some((d) => hostMatches(host, d));
  if (allowed && flags.length === 0) add('allowlisted', 'low', host);
  else if (!allowed && flags.length === 0) add('unknown_domain', 'medium', 'not on the education allowlist; review manually');
  const yt = youTubeId(u.toString());
  if ((hostMatches(host, 'youtube.com') || host === 'youtu.be') && !yt && !/^\/(@|c\/|channel\/|playlist)/.test(u.pathname)) add('youtube_bad_id', 'medium');
  return { url: u.toString(), host, level: maxLevel(...flags.map((f) => f.level)), flags, youtubeId: yt };
}

/** Overall verdict for a submission: worst URL wins; no URLs = low. */
export function combine(results: UrlRisk[]): { level: RiskLevel; flags: (RiskFlag & { url: string })[] } {
  const flags = results.flatMap((r) => r.flags.map((f) => ({ ...f, url: r.url })));
  return { level: results.length ? maxLevel(...results.map((r) => r.level)) : 'low', flags };
}
