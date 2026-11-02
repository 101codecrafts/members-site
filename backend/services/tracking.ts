import 'server-only';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
import { sha256, randomToken } from '@/lib/crypto';
import { env } from '@/lib/env';
import { sendEmails, templates } from '@/lib/email';
import type { trackBody, errorIngestBody, newsletterBody } from '@/lib/validation';
import { getSession } from '@/lib/auth';

const KINDS = ['resource', 'external_course', 'news', 'job'] as const;

/** /go/{id}: resolves the stored destination (never a user-supplied URL), counts and logs the click. */
export async function trackClick(id: string, kindHint: string | null, req: NextRequest, _ip: string): Promise<string | null> {
  const db = serviceClient();
  const kinds = kindHint && (KINDS as readonly string[]).includes(kindHint) ? [kindHint] : [...KINDS];
  let target: string | null = null;
  let kind: string | null = null;
  for (const k of kinds) {
    target = await rpc(db, 'register_click', { p_kind: k, p_id: id });
    if (target) { kind = k; break; }
  }
  if (!target || !target.startsWith('https://')) return null;
  const session = await getSession().catch(() => null);
  await db.from('analytics_events').insert({ event_name: 'outbound_click', user_id: session?.userId ?? null, path: `/go/${id}`,
    referrer: req.headers.get('referer')?.slice(0, 500) ?? null, properties: { kind, target_host: new URL(target).hostname } });
  return target;
}

export async function recordEvents(events: z.infer<typeof trackBody>['events'], userId: string | null, country: string | null, _ip: string): Promise<number> {
  const rows = events.map((e) => ({ event_name: e.name, user_id: userId, anonymous_id: e.anonymous_id ?? null, session_id: e.session_id ?? null, path: e.path ?? null,
    referrer: e.referrer ?? null, utm_source: e.utm_source ?? null, utm_medium: e.utm_medium ?? null, utm_campaign: e.utm_campaign ?? null, platform: e.platform,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null, properties: e.properties ?? {} }));
  const { error } = await serviceClient().from('analytics_events').insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function recordClientError(e: z.infer<typeof errorIngestBody>, userId: string | null): Promise<void> {
  const stripPii = (s: string | undefined) => s?.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d\s-]{7,}\d/g, '[number]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]');
  await serviceClient().from('error_events').insert({ source: e.source, level: e.level, message: stripPii(e.message)!.slice(0, 1000), stack: stripPii(e.stack) ?? null,
    path: e.path?.split('?')[0] ?? null, release: e.release ?? null, fingerprint: e.fingerprint ?? sha256(e.message).slice(0, 32),
    user_hash: userId ? sha256(userId + env().HASH_SALT).slice(0, 32) : null });
}

/** Double opt-in newsletter; Resend audience sync on confirmation. */
export async function subscribeNewsletter(input: z.infer<typeof newsletterBody>): Promise<void> {
  const e = env();
  const token = randomToken(24);
  const db = serviceClient();
  const { error } = await db.from('newsletter_subscribers').upsert({ email: input.email.toLowerCase(), source: input.source ?? 'site', status: 'pending', confirm_token_hash: sha256(token) },
    { onConflict: 'email', ignoreDuplicates: false });
  if (error && error.code !== '23505') throw error;
  await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, [{ to: input.email, ...templates.newsletterConfirm(`${e.APP_URL}/api/v1/newsletter/confirm?token=${token}`) }]);
}

export async function confirmNewsletter(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return false;
  const e = env();
  const db = serviceClient();
  const row = (await db.from('newsletter_subscribers').update({ status: 'subscribed', confirmed_at: new Date().toISOString(), confirm_token_hash: null })
    .eq('confirm_token_hash', sha256(token)).select('id, email').maybeSingle()).data;
  if (!row) return false;
  if (e.RESEND_API_KEY && e.RESEND_AUDIENCE_ID) {
    const r = await fetch(`https://api.resend.com/audiences/${e.RESEND_AUDIENCE_ID}/contacts`, { method: 'POST',
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ email: row.email, unsubscribed: false }) });
    const j = (await r.json().catch(() => ({}))) as { id?: string };
    if (j.id) await db.from('newsletter_subscribers').update({ resend_contact_id: j.id }).eq('id', row.id);
  }
  return true;
}
