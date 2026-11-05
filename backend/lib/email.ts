import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Resend transactional email over plain fetch (no SDK). Templates are tiny,
 * inline-styled, escaped HTML in the 101 brand colours. Batch API sends up to
 * 100 messages per call (announcements, event reminders).
 */
export interface Email { to: string; subject: string; html: string; text: string; tags?: { name: string; value: string }[] }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString('en-UG')}`;

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0f14;font-family:Inter,Arial,sans-serif;color:#e6edf3">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#111821;border-radius:14px;padding:32px">
<tr><td style="font:600 14px Rajdhani,Arial;letter-spacing:.12em;color:#22d3a6">101 CODECRAFTS</td></tr>
<tr><td style="padding-top:12px;font:700 22px Arial;color:#fff">${esc(title)}</td></tr>
<tr><td style="padding-top:16px;font-size:15px;line-height:1.6;color:#c9d4df">${bodyHtml}</td></tr>
${cta ? `<tr><td style="padding-top:24px"><a href="${esc(cta.url)}" style="background:#22d3a6;color:#0b0f14;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">${esc(cta.label)}</a></td></tr>` : ''}
<tr><td style="padding-top:28px;font-size:12px;color:#7d8b99">Kampala, Uganda · You receive this because you have a 101 Codecrafts account. Manage email preferences in your dashboard.</td></tr>
</table></td></tr></table></body></html>`;
}

export const templates = {
  adminInvite: (p: { inviter: string; url: string; scopes: string[]; expires: string }): Omit<Email, 'to'> => ({
    subject: 'You are invited to be a 101 Codecrafts admin',
    html: layout('Admin invite', `<p>${esc(p.inviter)} invited you to help run 101 Codecrafts as an admin.</p><p>Permissions: <b>${esc(p.scopes.join(', '))}</b></p>`
      + `<p>Sign in with this email address to accept. The link expires ${esc(p.expires)}. If you did not expect this, ignore this email.</p>`, { label: 'Accept the invite', url: p.url }),
    text: `${p.inviter} invited you to be a 101 Codecrafts admin (${p.scopes.join(', ')}). Accept (sign in with this email): ${p.url} — expires ${p.expires}.`,
  }),
  welcome: (name: string, appUrl: string): Omit<Email, 'to'> => ({
    subject: 'Welcome to 101 Codecrafts 👋',
    html: layout(`Welcome, ${name}!`, `<p>Your account is ready. Pick a learning path, join a group and ship your first project.</p>`, { label: 'Open your dashboard', url: `${appUrl}/dashboard.html` }),
    text: `Welcome, ${name}! Open your dashboard: ${appUrl}/dashboard.html`,
  }),
  membershipApproved: (name: string, appUrl: string): Omit<Email, 'to'> => ({
    subject: 'Your membership is approved',
    html: layout(`You're in, ${name}!`, `<p>Your 101 Codecrafts membership was approved.</p>`, { label: 'Start learning', url: `${appUrl}/dashboard.html` }),
    text: `You're in, ${name}! ${appUrl}/dashboard.html`,
  }),
  tutorVerified: (name: string, appUrl: string): Omit<Email, 'to'> => ({
    subject: 'You are now a verified tutor',
    html: layout(`Congratulations, ${name}`, `<p>You can now publish courses, run live sessions and earn. Remember to enable two-factor authentication.</p>`, { label: 'Create a course', url: `${appUrl}/dashboard.html#teach` }),
    text: `You are now a verified tutor: ${appUrl}/dashboard.html#teach`,
  }),
  receipt: (p: { name: string; invoice: string; amount: number; item: string; date: string }, appUrl: string): Omit<Email, 'to'> => ({
    subject: `Receipt ${p.invoice} — ${ugx(p.amount)}`,
    html: layout('Payment received', `<p>Hi ${esc(p.name)}, thank you for your payment.</p>
<table style="width:100%;font-size:14px;color:#c9d4df"><tr><td>Invoice</td><td align="right">${esc(p.invoice)}</td></tr>
<tr><td>Item</td><td align="right">${esc(p.item)}</td></tr><tr><td>Date</td><td align="right">${esc(p.date)}</td></tr>
<tr><td style="font-weight:700;color:#fff">Total</td><td align="right" style="font-weight:700;color:#fff">${ugx(p.amount)}</td></tr></table>`, { label: 'View payments', url: `${appUrl}/dashboard.html#payments` }),
    text: `Receipt ${p.invoice}: ${p.item} — ${ugx(p.amount)} on ${p.date}`,
  }),
  eventReminder: (p: { name: string; title: string; when: string; url: string }): Omit<Email, 'to'> => ({
    subject: `Reminder: ${p.title} is coming up`,
    html: layout(p.title, `<p>Hi ${esc(p.name)}, see you on <strong>${esc(p.when)}</strong> (Kampala time).</p>`, { label: 'Event details', url: p.url }),
    text: `${p.title} — ${p.when} (Kampala time). ${p.url}`,
  }),
  payoutSent: (p: { name: string; amount: number; reference: string }): Omit<Email, 'to'> => ({
    subject: `Payout sent — ${ugx(p.amount)}`,
    html: layout('Payout sent', `<p>Hi ${esc(p.name)}, we sent ${ugx(p.amount)} (ref ${esc(p.reference)}).</p>`),
    text: `Payout sent: ${ugx(p.amount)} ref ${p.reference}`,
  }),
  guardianConsent: (p: { guardian: string; child: string; url: string }): Omit<Email, 'to'> => ({
    subject: `Please approve ${p.child}'s 101 Codecrafts account`,
    html: layout('Guardian approval needed', `<p>Dear ${esc(p.guardian)}, ${esc(p.child)} wants to join 101 Codecrafts, a learning community for young coders in Uganda. Because they are under 18 we need your consent. The link expires in 7 days.</p>`, { label: 'Review and approve', url: p.url }),
    text: `Approve ${p.child}'s account: ${p.url}`,
  }),
  announcement: (p: { title: string; body: string; url: string }): Omit<Email, 'to'> => ({
    subject: p.title, html: layout(p.title, `<p>${esc(p.body).replace(/\n/g, '<br>')}</p>`, { label: 'Read more', url: p.url }), text: `${p.title}\n\n${p.body}\n${p.url}`,
  }),
  newsletterConfirm: (url: string): Omit<Email, 'to'> => ({
    subject: 'Confirm your subscription', html: layout('One more step', '<p>Confirm you want the 101 Codecrafts newsletter.</p>', { label: 'Confirm', url }), text: `Confirm: ${url}`,
  }),
};

export async function sendEmails(apiKey: string | undefined, from: string, emails: Email[]): Promise<number> {
  if (!apiKey || emails.length === 0) {
    if (!apiKey) logger.warn('email_skipped_no_key', { count: emails.length });
    return 0;
  }
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const batch = emails.slice(i, i + 100).map((e) => ({ from, to: [e.to], subject: e.subject, html: e.html, text: e.text, tags: e.tags }));
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(batch), signal: AbortSignal.timeout(15000),
    });
    if (res.ok) sent += batch.length;
    else logger.error('email_batch_failed', { status: res.status });
  }
  return sent;
}
