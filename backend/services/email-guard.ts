import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveMx } from 'node:dns/promises';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
import { sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import { decide, domainOf, inList, normaliseEmail, parseBlocklist, type GuardVerdict } from '@/lib/email-normalise';

/**
 * Defence in depth behind Clerk's "Block disposable email addresses" and
 * "Block email subaddresses" restrictions. Blocklist = pinned copy of
 * github.com/disposable-email-domains/disposable-email-domains
 * (backend/data/disposable_email_blocklist.conf, refreshed weekly by a PR
 * from .github/workflows/refresh-disposable-domains.yml).
 */
let cached: Set<string> | null = null;
function blocklist(): Set<string> {
  if (!cached) {
    try { cached = parseBlocklist(readFileSync(join(process.cwd(), 'data', 'disposable_email_blocklist.conf'), 'utf8')); }
    catch { cached = new Set(); }
  }
  return cached;
}

async function hasMx(domain: string): Promise<boolean | null> {
  try { return (await resolveMx(domain)).length > 0; }
  catch (e) { const code = (e as { code?: string }).code; return code === 'ENOTFOUND' || code === 'ENODATA' ? false : null; }   // null = DNS hiccup, don't block
}

export async function checkEmail(email: string, opts: { userId?: string; ipHash?: string } = {}): Promise<GuardVerdict> {
  const db = serviceClient();
  const domain = domainOf(email);
  const rule = (await rpc(db, 'email_domain_rule', { p_domain: domain })) as 'allow' | 'deny' | null;
  const disposable = inList(domain, blocklist());
  const mx = rule === 'allow' || disposable ? true : await hasMx(domain);
  let v = decide({ email, rule, disposable, hasMx: mx });
  if (v.ok) {
    // one account per canonical mailbox (gmail dots / +tags)
    const fp = sha256(env().HASH_SALT + normaliseEmail(email));
    const other = (await db.from('email_fingerprints').select('user_id').eq('fingerprint', fp).maybeSingle()).data;
    if (other && other.user_id !== opts.userId) v = { ok: false, reason: 'duplicate' };
    else if (!other && opts.userId) await db.from('email_fingerprints').insert({ fingerprint: fp, user_id: opts.userId });
  }
  if (!v.ok) await rpc(db, 'log_security_event', { p_kind: `signup.blocked_${v.reason}`, p_user: opts.userId, p_domain: domain, p_ip_hash: opts.ipHash });
  return v;
}
