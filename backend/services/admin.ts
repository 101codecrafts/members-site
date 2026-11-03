import 'server-only';
import type { z } from 'zod';
import type { Session } from '@/lib/auth';
import type { announcementBody, newsManualBody } from '@/lib/validation';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
import { unwrap } from '@/lib/http';
import { toCsv } from '@/lib/csv';
import { env } from '@/lib/env';
import { sha256 } from '@/lib/crypto';
import { normaliseUrl } from '@/lib/unfurl';
import { sendEmails, templates, type Email } from '@/lib/email';
import { rehostImage, unfurlUrl } from '@/services/resources';

export async function notifyDecisionEmail(userId: string, kind: 'membership' | 'tutor'): Promise<void> {
  const e = env();
  const db = serviceClient();
  const c = (await db.from('profile_private').select('email').eq('user_id', userId).maybeSingle()).data;
  const p = (await db.from('profiles').select('display_name').eq('id', userId).maybeSingle()).data;
  if (!c?.email) return;
  const t = kind === 'tutor' ? templates.tutorVerified(p?.display_name || 'there', e.APP_URL) : templates.membershipApproved(p?.display_name || 'there', e.APP_URL);
  await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, [{ to: c.email, ...t }]);
}

/** Create (as admin, RLS) → fan out in-app (one SQL insert) → optional email batch. */
export async function broadcastAnnouncement(s: Session, a: z.infer<typeof announcementBody>) {
  const e = env();
  const row = unwrap(await s.db.from('announcements').insert({ title: a.title, body: a.body, audience: a.audience, link: a.link ?? null, send_email: a.send_email,
    published_at: a.publish ? new Date().toISOString() : null, created_by: s.userId }).select('id').single());
  if (!a.publish) return { id: row.id, recipients: 0, emailed: 0 };
  const recipients = await rpc(s.db, 'fanout_announcement', { p_announcement_id: row.id });
  let emailed = 0;
  if (a.send_email) {
    const db = serviceClient();
    const people = (await db.from('profiles').select('id').eq('account_status', 'active').eq('email_opt_in', true).is('deleted_at', null).limit(20000)).data ?? [];
    const ids = people.map((p) => p.id);
    const emails: Email[] = [];
    for (let i = 0; i < ids.length; i += 1000) {
      const contacts = (await db.from('profile_private').select('email').in('user_id', ids.slice(i, i + 1000))).data ?? [];
      for (const c of contacts) if (c.email) emails.push({ to: c.email, ...templates.announcement({ title: a.title, body: a.body, url: `${e.APP_URL}${a.link ?? '/dashboard.html#announcements'}` }) });
    }
    emailed = await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, emails);
  }
  return { id: row.id, recipients, emailed };
}

/**
 * CSV export (admin JWT → RLS still applies). Formula-injection safe (SR-18).
 * Each export is written to audit_log via the service role.
 */
export async function exportCsv(s: Session, dataset: string, from?: string, to?: string): Promise<Response> {
  const f = from ?? '2020-01-01';
  const t = to ? `${to}T23:59:59Z` : new Date().toISOString();
  const queries: Record<string, () => PromiseLike<{ data: unknown; error: { message: string } | null }>> = {
    members: () => s.db.from('profiles').select('id, username, display_name, account_status, education_level, is_minor, joined_at, last_seen_at, created_at').gte('created_at', f).lte('created_at', t).limit(50000),
    payments: () => s.db.from('payments').select('id, tx_ref, user_id, payee_id, purpose, amount_ugx, discount_ugx, platform_fee_ugx, payee_share_ugx, refunded_ugx, status, payment_type, verified_at, created_at').gte('created_at', f).lte('created_at', t).limit(50000),
    payouts: () => s.db.from('payouts').select('id, tutor_id, amount_ugx, status, reference, reviewed_by, processed_at, created_at').gte('created_at', f).lte('created_at', t).limit(50000),
    refunds: () => s.db.from('refunds').select('id, payment_id, amount_ugx, status, reason, approved_by, completed_at, created_at').gte('created_at', f).lte('created_at', t).limit(50000),
    enrollments: () => s.db.from('enrollments').select('id, user_id, course_id, status, progress_pct, enrolled_at, completed_at').gte('enrolled_at', f).lte('enrolled_at', t).limit(50000),
    audit_log: () => s.db.from('audit_log').select('id, actor_id, actor_role, action, table_name, record_id, created_at').gte('created_at', f).lte('created_at', t).limit(50000),
    event_registrations: () => s.db.from('event_registrations').select('id, event_id, user_id, status, checked_in_at, created_at').gte('created_at', f).lte('created_at', t).limit(50000),
    ledger: () => s.db.from('ledger_entries').select('id, transaction_id, account_id, direction, amount_ugx, created_at').gte('created_at', f).lte('created_at', t).limit(100000),
  };
  const run = queries[dataset];
  if (!run) throw new Error('unknown dataset');
  const rows = unwrap(await run()) as Record<string, unknown>[];
  await rpc(serviceClient(), 'write_audit', { p_actor: s.userId, p_action: 'admin.export_csv', p_table: dataset, p_record: `${rows.length} rows`, p_context: { from: f, to: t } });
  return new Response(toCsv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="101cc-${dataset}-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
}

export async function addManualNews(s: Session, n: z.infer<typeof newsManualBody>) {
  const meta = await unfurlUrl(n.url);
  const canonical = normaliseUrl(meta.canonical_url || n.url);
  const hash = sha256(canonical);
  const image = await rehostImage(meta.image_source_url, 'resource-thumbs', `news/${hash.slice(0, 32)}`);
  return unwrap(await s.db.from('news_items').insert({ source: 'manual', url: canonical, url_hash: hash, title: (n.title ?? meta.title).slice(0, 300),
    summary: meta.description?.slice(0, 1000) ?? null, image_url: image, category: n.category, is_manual: true, added_by: s.userId, is_featured: true }).select('*').single());
}

export async function createExternalCourse(s: Session, c: { url: string; provider: string; access_type: 'free' | 'free_audit' | 'free_trial' | 'free_until' | 'paid_with_aid';
  free_until?: string; certificate_free: boolean; level?: 'primary' | 'o_level' | 'a_level' | 'university' | 'professional'; category?: string; language: string }) {
  const meta = await unfurlUrl(c.url);
  const canonical = normaliseUrl(meta.canonical_url || c.url);
  const hash = sha256(canonical);
  const cover = await rehostImage(meta.image_source_url, 'resource-thumbs', `ext/${hash.slice(0, 32)}`);
  return unwrap(await s.db.from('external_courses').insert({ title: meta.title, description: meta.description, provider: c.provider, source_url: canonical, url_hash: hash,
    cover_image_url: cover, image_source_url: meta.image_source_url, access_type: c.access_type, free_until: c.free_until ?? null, certificate_free: c.certificate_free,
    level: c.level ?? null, category: c.category ?? null, language: c.language, duration_text: meta.duration_text, tags: meta.tags, approved: true }).select('*').single());
}
