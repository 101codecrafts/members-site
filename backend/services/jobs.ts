import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { rpc } from '@/repositories/rpc';
import { sendEmails, templates, type Email } from '@/lib/email';
import { sendExpoPush } from '@/lib/push';
import { renderCertificatePdf } from '@/lib/certificate';
import type { Logger } from '@/lib/logger';
import { clerkClient } from '@clerk/nextjs/server';

/** Scheduled work (Vercel Cron, Bearer CRON_SECRET). All service role. */

export async function dailyJobs(log: Logger) {
  const db = serviceClient();
  const maintenance = await rpc(db, 'run_daily_maintenance');
  const plansDowngraded = await rpc(db, 'run_daily_plan_sync');
  await rpc(db, 'refresh_analytics');
  const emails = await deliverNotificationEmails(log);
  const deletions = await processDeletionRequests(log);
  const certs = await renderPendingCertificates(log);
  const promo = await promoEndingReminders(log);
  return { promo_reminder: promo, maintenance, plans_downgraded: plansDowngraded, emails, deletions, certificates: certs };
}

/** Reminders for events starting in the next 36 h (once per registration). */
export async function eventReminders(log: Logger) {
  const e = env();
  const db = serviceClient();
  const now = new Date();
  const until = new Date(now.getTime() + 36 * 3600 * 1000);
  const events = (await db.from('events').select('id, slug, title, starts_at').eq('status', 'published').gte('starts_at', now.toISOString()).lte('starts_at', until.toISOString())).data ?? [];
  let sent = 0;
  for (const ev of events) {
    const regs = (await db.from('event_registrations').select('id, user_id').eq('event_id', ev.id).eq('status', 'registered').is('reminder_sent_at', null)).data ?? [];
    if (!regs.length) continue;
    const ids = regs.map((r) => r.user_id);
    const contacts = (await db.from('profile_private').select('user_id, email').in('user_id', ids)).data ?? [];
    const names = (await db.from('profiles').select('id, display_name, email_opt_in').in('id', ids)).data ?? [];
    const when = new Date(ev.starts_at).toLocaleString('en-GB', { timeZone: 'Africa/Kampala', dateStyle: 'medium', timeStyle: 'short' });
    const batch: Email[] = contacts.flatMap((c) => {
      const p = names.find((n) => n.id === c.user_id);
      return c.email ? [{ to: c.email, ...templates.eventReminder({ name: p?.display_name || 'there', title: ev.title, when, url: `${e.APP_URL}/dashboard.html#events/${ev.slug}` }) }] : [];
    });
    sent += await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, batch);
    await db.from('event_registrations').update({ reminder_sent_at: new Date().toISOString() }).in('id', regs.map((r) => r.id));
    for (const uid of ids) await db.from('notifications').insert({ user_id: uid, type: 'event.reminder', title: `${ev.title} is coming up`, body: when, link: `/dashboard.html#events/${ev.slug}` });
  }
  log.info('event_reminders', { events: events.length, sent });
  return { events: events.length, emails: sent };
}

/** Emails + push for notifications whose category the user opted into. */
export async function deliverNotificationEmails(log: Logger) {
  const e = env();
  const db = serviceClient();
  const pending = (await db.from('notifications').select('id, user_id, type, title, body, link').is('emailed_at', null)
    .gte('created_at', new Date(Date.now() - 2 * 864e5).toISOString()).limit(500)).data ?? [];
  if (!pending.length) return { emailed: 0, pushed: 0 };
  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const prefs = (await db.from('notification_preferences').select('user_id, email').in('user_id', userIds)).data ?? [];
  const contacts = (await db.from('profile_private').select('user_id, email').in('user_id', userIds)).data ?? [];
  const tokens = (await db.from('device_tokens').select('user_id, token, provider').in('user_id', userIds).is('disabled_at', null)).data ?? [];
  const category = (t: string) => ({ message: 'messages', comment: 'comments', course: 'courses', certificate: 'courses', event: 'events', session: 'events',
    payment: 'payments', payout: 'payments', refund: 'payments', order: 'payments', badge: 'gamification', xp: 'gamification' } as Record<string, string>)[t.split('.')[0] ?? ''] ?? 'announcements';
  const emails: Email[] = [];
  for (const n of pending) {
    const pref = (prefs.find((p) => p.user_id === n.user_id)?.email ?? {}) as Record<string, boolean>;
    const to = contacts.find((c) => c.user_id === n.user_id)?.email;
    const transactional = /^(payment|payout|refund|account|membership|tutor)\./.test(n.type);
    if (to && (transactional || pref[category(n.type)])) emails.push({ to, ...templates.announcement({ title: n.title, body: n.body ?? '', url: `${e.APP_URL}${n.link ?? '/dashboard.html'}` }) });
  }
  const emailed = await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, emails);
  const push = tokens.filter((t) => t.provider === 'expo').flatMap((t) => pending.filter((n) => n.user_id === t.user_id).slice(0, 3)
    .map((n) => ({ to: t.token, title: n.title, body: n.body ?? undefined, data: { link: n.link ?? '/' } })));
  const { invalidTokens } = push.length ? await sendExpoPush(push, e.EXPO_ACCESS_TOKEN) : { invalidTokens: [] as string[] };
  if (invalidTokens.length) await db.from('device_tokens').update({ disabled_at: new Date().toISOString() }).in('token', invalidTokens);
  await db.from('notifications').update({ emailed_at: new Date().toISOString() }).in('id', pending.map((n) => n.id));
  log.info('notifications_delivered', { emailed, pushed: push.length });
  return { emailed, pushed: push.length };
}

/** DPPA erasure: process verified delete requests (Clerk user + DB anonymisation). */
export async function processDeletionRequests(log: Logger) {
  const db = serviceClient();
  const reqs = (await db.from('data_requests').select('id, user_id').eq('kind', 'delete').in('status', ['received', 'processing'])
    .lte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()).limit(50)).data ?? [];   // 24 h cool-off
  for (const r of reqs) {
    await rpc(db, 'erase_user', { p_user: r.user_id, p_actor: 'privacy-job' });
    try { await (await clerkClient()).users.deleteUser(r.user_id); } catch { /* already gone */ }
  }
  log.info('deletions_processed', { count: reqs.length });
  return reqs.length;
}

/** Renders PDFs for newly issued certificates into the private bucket. */
export async function renderPendingCertificates(log: Logger) {
  const e = env();
  const db = serviceClient();
  const certs = (await db.from('certificates').select('id, user_id, verify_code, title, recipient_name, tutor_name, issued_at').is('pdf_path', null).is('revoked_at', null).limit(100)).data ?? [];
  for (const c of certs) {
    const pdf = await renderCertificatePdf({ recipient: c.recipient_name, title: c.title, tutor: c.tutor_name, issuedAt: c.issued_at, code: c.verify_code, verifyUrl: `${e.APP_URL}/verify/${c.verify_code}` });
    const path = `${c.user_id}/${c.id}.pdf`;
    const up = await db.storage.from('certificates').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (!up.error) await db.from('certificates').update({ pdf_path: path }).eq('id', c.id);
  }
  log.info('certificates_rendered', { count: certs.length });
  return certs.length;
}

/** Launch promo: email everyone 7 days and 1 day before it ends (each once; claim is atomic in SQL). */
export async function promoEndingReminders(log: Logger) {
  const e = env();
  const db = serviceClient();
  const due = await rpc(db, 'claim_promo_reminder');
  if (!due) return null;
  const promo = (await db.from('site_settings').select('value').eq('key', 'launch_promo').single()).data?.value as { ends_at?: string } | undefined;
  const ends = promo?.ends_at ? new Date(promo.ends_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Kampala', dateStyle: 'long' }) : 'soon';
  const title = due === '1d' ? 'Free launch month ends tomorrow' : 'One week left of free 101 Pro';
  const text = `Everything on 101 Codecrafts is free until ${ends}. After that the free plan includes ads and 101 Pro (ad-free, all paid courses) is a paid subscription. Keep learning!`;
  const people = (await db.from('profiles').select('id').eq('account_status', 'active').is('deleted_at', null).limit(20000)).data ?? [];
  const emails: Email[] = [];
  for (let i = 0; i < people.length; i += 1000) {
    const contacts = (await db.from('profile_private').select('email').in('user_id', people.slice(i, i + 1000).map((p) => p.id))).data ?? [];
    for (const c of contacts) if (c.email) emails.push({ to: c.email, ...templates.announcement({ title, body: text, url: `${e.APP_URL}/dashboard.html#pro` }) });
  }
  const sent = await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, emails);
  log.info('promo_reminder', { due, sent });
  return { due, sent };
}
