import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '@/lib/errors';

/**
 * SSRF-safe fetch for user-supplied URLs (unfurler, link checker):
 *  - https only, default port only, no credentials in the URL
 *  - every hop's hostname is resolved and ALL addresses must be public
 *    (blocks loopback, RFC1918, CGNAT, link-local incl. 169.254.169.254
 *    cloud metadata, ULA, multicast, reserved) — checked again per redirect
 *  - max 3 redirects, 5 s timeout, 2 MB body cap, content-type allow-list
 * Residual risk (DNS rebinding between check and connect) is documented in
 * docs/BACKEND.md; Vercel functions also have no access to private networks.
 */
const BLOCKED_V4: Array<[number, number]> = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12],
  [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
  [0xe0000000, 4], [0xf0000000, 4],
];
function v4ToInt(ip: string): number { return ip.split('.').reduce((a, o) => ((a << 8) + Number(o)) >>> 0, 0); }

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = v4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6) || v6.startsWith('2001:db8') || v6.startsWith('64:ff9b');
}

export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new AppError('bad_request', 'Invalid URL'); }
  if (u.protocol !== 'https:') throw new AppError('bad_request', 'Only https URLs are allowed');
  if (u.username || u.password) throw new AppError('bad_request', 'Credentials in URLs are not allowed');
  if (u.port && u.port !== '443') throw new AppError('bad_request', 'Non-standard ports are not allowed');
  if (isIP(u.hostname.replace(/^\[|\]$/g, ''))) throw new AppError('bad_request', 'IP-address URLs are not allowed');
  if (/(^|\.)(localhost|local|internal|intranet|corp|home|lan)$/i.test(u.hostname)) throw new AppError('bad_request', 'Host not allowed');
  return u;
}

async function assertPublicHost(host: string): Promise<void> {
  const addrs = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (addrs.length === 0) throw new AppError('bad_request', 'Host does not resolve');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new AppError('bad_request', 'Host resolves to a private address');
}

export interface SafeResponse { url: string; status: number; contentType: string; body: string; redirected: boolean }

export async function safeFetch(raw: string, opts: { maxBytes?: number; accept?: RegExp; method?: 'GET' | 'HEAD' } = {}): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const accept = opts.accept ?? /^(text\/html|application\/xhtml\+xml)/i;
  let current = assertSafeUrl(raw);
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublicHost(current.hostname);
    const res = await fetch(current, {
      method: opts.method ?? 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: { 'user-agent': '101CodecraftsBot/1.0 (+https://101codecrafts.com/bot)', accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc || hop === 3) throw new AppError('upstream_error', 'Too many redirects');
      current = assertSafeUrl(new URL(loc, current).toString());
      continue;
    }
    const ct = res.headers.get('content-type') ?? '';
    if (opts.method === 'HEAD') return { url: current.toString(), status: res.status, contentType: ct, body: '', redirected: hop > 0 };
    if (!accept.test(ct)) throw new AppError('unprocessable', `Unsupported content type: ${ct.split(';')[0] || 'unknown'}`);
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > maxBytes) throw new AppError('unprocessable', 'Page too large');
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) { await reader.cancel(); break; }
        chunks.push(value);
      }
    }
    return { url: current.toString(), status: res.status, contentType: ct, body: Buffer.concat(chunks).toString('utf8'), redirected: hop > 0 };
  }
  throw new AppError('upstream_error', 'Too many redirects');
}
