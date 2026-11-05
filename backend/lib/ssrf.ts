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
  if (isIP(ip) !== 6) return true;                        // not an IP literal at all: treat as unsafe
  const v6 = expandV6(ip);
  if (!v6) return true;
  const w = v6.split(':').map((h) => parseInt(h, 16));
  const embedded4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (w.every((x) => x === 0) || (w.slice(0, 7).every((x) => x === 0) && w[7] === 1)) return true;      // :: and ::1
  // r12 (R12-SEC-06): IPv4 embedded in IPv6 in any spelling (::ffff:7f00:1 as well as ::ffff:127.0.0.1),
  // IPv4-compatible ::a.b.c.d, NAT64 64:ff9b::/96, 6to4 2002::/16 (embedded IPv4 checked) and Teredo 2001:0::/32 (always refused).
  if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0xffff || w[5] === 0)) return isPrivateIp(embedded4(w[6]!, w[7]!));
  if (w[0] === 0x64 && w[1] === 0xff9b) return true;
  if (w[0] === 0x2002) return isPrivateIp(embedded4(w[1]!, w[2]!));
  if (w[0] === 0x2001 && w[1] === 0) return true;                 // Teredo tunnels: never a legitimate fetch target
  const top = w[0]!;
  if ((top & 0xfe00) === 0xfc00) return true;             // fc00::/7 ULA
  if ((top & 0xffc0) === 0xfe80 || (top & 0xffc0) === 0xfec0) return true;   // link-local, deprecated site-local
  if ((top & 0xff00) === 0xff00) return true;             // multicast
  if (top === 0x2001 && w[1] === 0x0db8) return true;     // documentation
  if (top === 0x0100 && w[1] === 0 && w[2] === 0 && w[3] === 0) return true; // discard-only 100::/64
  return false;
}

/** Expands an IPv6 literal (with optional dotted IPv4 tail and zone id) to 8 four-digit groups, or null. */
export function expandV6(ip: string): string | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]!;
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const o = m[2]!.split('.').map(Number);
    if (o.some((x) => x > 255)) return null;
    s = m[1] + ((o[0]! << 8) | o[1]!).toString(16) + ':' + ((o[2]! << 8) | o[3]!).toString(16);
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (parts.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => h.padStart(4, '0')).join(':');
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

export interface SafeResponse { url: string; status: number; contentType: string; body: string; bytes: Buffer; redirected: boolean }

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
    if (opts.method === 'HEAD') return { url: current.toString(), status: res.status, contentType: ct, body: '', bytes: Buffer.alloc(0), redirected: hop > 0 };
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
    const bytes = Buffer.concat(chunks);
    return { url: current.toString(), status: res.status, contentType: ct, body: bytes.toString('utf8'), bytes, redirected: hop > 0 };
  }
  throw new AppError('upstream_error', 'Too many redirects');
}
