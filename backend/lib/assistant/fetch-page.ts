import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Server-side page fetch for "Explain with 101 AI" and "summarise this link" (round 12).
 * SSRF guard (OWASP SSRF cheat sheet): http/https only, ports 80/443 only, no credentials in the URL,
 * the host must resolve ONLY to public unicast addresses (every A/AAAA record is checked), redirects are
 * followed by hand (max 3) and each hop is re-checked, 6 s timeout, 1.5 MB cap, text/html or text/plain only.
 * The returned text is UNTRUSTED: callers must wrap it as data (see wrapUntrusted) and never follow
 * instructions in it.
 */
export const PAGE_LIMITS = { timeoutMs: 6000, maxBytes: 1_500_000, maxChars: 12_000, maxRedirects: 3 };

export interface Page { url: string; title: string; text: string }
export class PageError extends Error { reason: string; constructor(reason: string) { super(reason); this.reason = reason; } }

/** true for loopback, private, link-local, CGNAT, multicast, reserved, metadata and v4-mapped private ranges */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number) as [number, number, number, number];
    const [a, b] = p;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s); if (m) return isPrivateAddress(m[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8');
  }
  return true;
}

/** Parse and validate a user/DB-supplied URL. Throws PageError. */
export function checkUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new PageError('bad_url'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new PageError('bad_scheme');
  if (u.username || u.password) throw new PageError('credentials_in_url');
  if (u.port && u.port !== '80' && u.port !== '443') throw new PageError('bad_port');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') || !host.includes('.') && !isIP(host)) throw new PageError('private_host');
  if (isIP(host) && isPrivateAddress(host)) throw new PageError('private_host');
  return u;
}

type Resolver = (host: string) => Promise<string[]>;
const dnsResolve: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

async function assertPublic(u: URL, resolve: Resolver) {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [host] : await resolve(host).catch(() => { throw new PageError('dns_failed'); });
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new PageError('private_host');
}

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ' '; })
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 31 && c < 0x10ffff ? String.fromCodePoint(c) : ' '; });

/** Readable text from HTML: drops scripts, styles, nav/footer/aside/forms, hidden elements and comments. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  const desc = decode(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? '').trim();
  let h = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|aside|form|button|select|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+(hidden|aria-hidden=["']true["']|display:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ');
  const main = /<(article|main)\b[\s\S]*?<\/\1>/i.exec(h)?.[0];
  if (main && main.length > 800) h = main;
  const text = decode(h.replace(/<\/(p|div|h[1-6]|li|tr|br|section|blockquote|pre)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '\n- ').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return { title, text: ((desc && !text.includes(desc) ? desc + '\n\n' : '') + text).slice(0, PAGE_LIMITS.maxChars) };
}

/** Fetch a public page as plain text. Throws PageError with a short reason (safe to log). */
export async function fetchPage(raw: string, opts: { resolve?: Resolver; fetchImpl?: typeof fetch } = {}): Promise<Page> {
  const resolve = opts.resolve ?? dnsResolve; const f = opts.fetchImpl ?? fetch;
  let u = checkUrl(raw);
  for (let hop = 0; hop <= PAGE_LIMITS.maxRedirects; hop++) {
    await assertPublic(u, resolve);
    const res = await f(u.toString(), {
      redirect: 'manual', signal: AbortSignal.timeout(PAGE_LIMITS.timeoutMs),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; 101AI-explain/1.0; +https://101codecrafts.org)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
    }).catch((e: unknown) => { throw new PageError(e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network'); });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location'); try { await res.body?.cancel(); } catch { /* ignore */ }
      if (!loc) throw new PageError('bad_redirect');
      u = checkUrl(new URL(loc, u).toString()); continue;
    }
    if (!res.ok || !res.body) throw new PageError('http_' + res.status);
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!/text\/html|text\/plain|application\/xhtml/.test(ct)) { try { await res.body.cancel(); } catch { /* ignore */ } throw new PageError('not_text'); }
    const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      n += value.byteLength; chunks.push(value);
      if (n > PAGE_LIMITS.maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } break; }
    }
    const buf = new Uint8Array(n > PAGE_LIMITS.maxBytes ? PAGE_LIMITS.maxBytes : n); let o = 0;
    for (const c of chunks) { const take = Math.min(c.byteLength, buf.length - o); if (take <= 0) break; buf.set(c.subarray(0, take), o); o += take; }
    const body = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    const { title, text } = ct.includes('text/plain') ? { title: '', text: body.slice(0, PAGE_LIMITS.maxChars) } : htmlToText(body);
    if (text.replace(/\s/g, '').length < 200) throw new PageError('too_little_text');
    return { url: u.toString(), title, text };
  }
  throw new PageError('too_many_redirects');
}

/**
 * Spotlighting (Hines et al. 2024, arXiv:2403.14720): put untrusted text between random, unguessable markers
 * and tell the model it is data. Marker-like strings inside the text are neutralised so it cannot "close" the block.
 */
export function wrapUntrusted(text: string, label: string, nonce = Math.random().toString(36).slice(2, 10).toUpperCase()): { block: string; nonce: string } {
  const clean = text.replace(/<<<|>>>/g, '‹‹‹').replace(/\b(UNTRUSTED|END)_[A-Z0-9]{4,}\b/g, '[marker removed]');
  return { nonce, block: `<<<UNTRUSTED_${nonce} source="${label.replace(/["\n]/g, '')}">>>\n${clean}\n<<<END_${nonce}>>>` };
}

/** First http(s) URL in a message, if any. */
export function firstUrl(s: string): string | null {
  const m = /https?:\/\/[^\s<>()"']+[^\s<>()"'.,!?;:]/i.exec(s);
  return m ? m[0] : null;
}
