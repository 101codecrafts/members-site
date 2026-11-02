/**
 * Pure helpers for the sign-up email guard (no server imports, unit-tested).
 * Gmail/Googlemail ignore dots and "+tags"; most providers ignore "+tags".
 */
const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com']);
const PLUS_PROVIDERS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'proton.me', 'protonmail.com', 'fastmail.com']);

export function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).trim().toLowerCase().replace(/\.$/, '');
}

/** Canonical mailbox used to detect duplicate accounts (alice.b+x@gmail.com → alicebx? no: aliceb@gmail.com). */
export function normaliseEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (PLUS_PROVIDERS.has(domain)) local = local.split('+')[0] ?? local;
  if (DOT_INSENSITIVE.has(domain)) local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export function hasSubaddress(email: string): boolean {
  const local = email.slice(0, email.lastIndexOf('@'));
  return local.includes('+');
}

export function parseBlocklist(text: string): Set<string> {
  return new Set(text.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')));
}

/** True if the domain or any parent domain is on the list (sub.mailinator.com → mailinator.com). */
export function inList(domain: string, list: Set<string>): boolean {
  const parts = domain.toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i++) if (list.has(parts.slice(i).join('.'))) return true;
  return false;
}

export type GuardVerdict = { ok: true } | { ok: false; reason: 'disposable' | 'denied_domain' | 'no_mx' | 'invalid' | 'subaddress' | 'duplicate' };

/** Decision order: admin allow-list wins; then admin deny; then disposable list; then MX. */
export function decide(input: { email: string; rule: 'allow' | 'deny' | null; disposable: boolean; hasMx: boolean | null; blockSubaddress?: boolean }): GuardVerdict {
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(input.email)) return { ok: false, reason: 'invalid' };
  if (input.rule === 'allow') return { ok: true };
  if (input.rule === 'deny') return { ok: false, reason: 'denied_domain' };
  if (input.disposable) return { ok: false, reason: 'disposable' };
  if (input.blockSubaddress && hasSubaddress(input.email)) return { ok: false, reason: 'subaddress' };
  if (input.hasMx === false) return { ok: false, reason: 'no_mx' };
  return { ok: true };
}
