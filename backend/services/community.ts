import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
import { env } from '@/lib/env';
import { sendEmails } from '@/lib/email';
import type { Logger } from '@/lib/logger';

async function emailOf(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = (await serviceClient().from('profile_private').select('user_id, email').in('user_id', userIds)).data ?? [];
  return new Map(rows.filter((r) => r.email).map((r) => [r.user_id, r.email as string]));
}

export async function communityJobs(log: Logger) {
  const db = serviceClient();
  const e = env();
  const expired = await rpc(db, 'expire_opportunities');
  let reminders = 0;
  for (const kind of ['7d', '1d'] as const) {
    const due = (await rpc(db, 'opportunity_claim_reminders', { p_kind: kind })) as unknown as Array<{ user_id: string; title: string; deadline_at: string; url: string }>;
    const emails = await emailOf([...new Set(due.map((d) => d.user_id))]);
    const msgs = due.filter((d) => emails.has(d.user_id)).map((d) => ({ to: emails.get(d.user_id) as string,
      subject: `Deadline ${kind === '7d' ? 'in 7 days' : 'tomorrow'}: ${d.title}`,
      html: `<p>The deadline for <b>${d.title.replace(/</g, '&lt;')}</b> is ${new Date(d.deadline_at).toLocaleString('en-UG', { timeZone: 'Africa/Kampala' })} (EAT).</p><p><a href="${e.APP_URL}/opportunities.html">View your saved opportunities</a></p>`,
      text: `Deadline for ${d.title}: ${new Date(d.deadline_at).toLocaleString('en-UG', { timeZone: 'Africa/Kampala' })} EAT. ${d.url}` }));
    if (msgs.length) await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, msgs);
    reminders += msgs.length;
  }
  const meetings = (await rpc(db, 'meetings_claim_reminders', { p_kind: '24h' })) as unknown as unknown[];
  // TODO: fan out meeting reminders (+ .ics via lib/meetings icsInvite) to participants per context.
  log.info('community_jobs', { expired, reminders, meetings_24h: meetings.length });
  return { opportunities_expired: expired, deadline_reminders: reminders, meetings_24h: meetings.length };
}
