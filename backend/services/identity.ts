import 'server-only';
import { Webhook } from 'svix';
import { clerkClient } from '@clerk/nextjs/server';
import { serviceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { recordWebhook, markWebhook } from '@/services/payments';
import { rpc } from '@/repositories/rpc';
import { sendEmails, templates } from '@/lib/email';
import type { Logger } from '@/lib/logger';
import { checkEmail } from '@/services/email-guard';

interface ClerkEmail { id: string; email_address: string; verification?: { status?: string } | null }
interface ClerkUser {
  id: string; username?: string | null; first_name?: string | null; last_name?: string | null; image_url?: string | null;
  email_addresses?: ClerkEmail[]; primary_email_address_id?: string | null; phone_numbers?: { phone_number: string }[];
  two_factor_enabled?: boolean; unsafe_metadata?: { ref?: string } | null;
}
interface ClerkEvent { type: string; data: ClerkUser & { deleted?: boolean } }

/**
 * Clerk → Supabase identity sync (svix-verified, idempotent via webhook_events).
 * Creates the profile row the rest of the schema hangs off, mirrors email
 * verification + MFA status, attaches referrals, and erases data on delete.
 */
export async function handleClerkWebhook(raw: string, headers: Headers, log: Logger): Promise<{ ok: true; duplicate?: boolean }> {
  const e = env();
  const svixId = headers.get('svix-id');
  const svixTs = headers.get('svix-timestamp');
  const svixSig = headers.get('svix-signature');
  if (!svixId || !svixTs || !svixSig) throw new AppError('unauthenticated', 'Missing svix headers');
  let evt: ClerkEvent;
  try {
    evt = new Webhook(e.CLERK_WEBHOOK_SIGNING_SECRET).verify(raw, { 'svix-id': svixId, 'svix-timestamp': svixTs, 'svix-signature': svixSig }) as ClerkEvent;
  } catch {
    throw new AppError('unauthenticated', 'Invalid signature');
  }
  const fresh = await recordWebhook('clerk', svixId, evt.type, true, { type: evt.type, user_id: evt.data?.id });
  if (!fresh) return { ok: true, duplicate: true };

  const db = serviceClient();
  try {
    const u = evt.data;
    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const primary = u.email_addresses?.find((x) => x.id === u.primary_email_address_id) ?? u.email_addresses?.[0];
      // Disposable / denied / no-MX / duplicate-alias emails: delete the Clerk user and stop (logged to security_events).
      if (primary?.email_address) {
        const verdict = await checkEmail(primary.email_address, { userId: u.id });
        if (!verdict.ok) {
          if (evt.type === 'user.created') await (await clerkClient()).users.deleteUser(u.id).catch(() => undefined);
          else await (await clerkClient()).users.banUser(u.id).catch(() => undefined);
          await markWebhook('clerk', svixId);
          log.warn('clerk_webhook.blocked_email', { type: evt.type, reason: verdict.reason });
          return { ok: true };
        }
      }
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || '';
      const username = u.username && /^[a-z0-9_]{3,30}$/.test(u.username) ? u.username : null;
      const { error } = await db.from('profiles').upsert({ id: u.id, display_name: name.slice(0, 80), username, avatar_url: u.image_url?.startsWith('https://') ? u.image_url : null },
        { onConflict: 'id', ignoreDuplicates: false });
      if (error) throw error;
      await db.from('profile_private').upsert({ user_id: u.id, email: primary?.email_address ?? null, phone: u.phone_numbers?.[0]?.phone_number?.replace(/[^\d+]/g, '') || null,
        mfa_enabled: Boolean(u.two_factor_enabled) }, { onConflict: 'user_id' });
      await db.from('onboarding_state').upsert({ user_id: u.id, email_verified: primary?.verification?.status === 'verified' }, { onConflict: 'user_id' });
      if (evt.type === 'user.created') {
        await db.from('notification_preferences').upsert({ user_id: u.id }, { onConflict: 'user_id', ignoreDuplicates: true });
        if (u.unsafe_metadata?.ref) await rpc(db, 'attach_referral', { p_referred: u.id, p_code: String(u.unsafe_metadata.ref).slice(0, 12) });
        if (primary?.email_address) await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, [{ to: primary.email_address, ...templates.welcome(name || 'there', e.APP_URL) }]);
      }
    } else if (evt.type === 'user.deleted' && u.id) {
      await rpc(db, 'erase_user', { p_user: u.id, p_actor: 'clerk:user.deleted' });
    }
    await markWebhook('clerk', svixId);
    log.info('clerk_webhook', { type: evt.type });
    return { ok: true };
  } catch (err) {
    await markWebhook('clerk', svixId, err instanceof Error ? err.message.slice(0, 500) : 'error');
    throw err;
  }
}

/** Ensures a profile exists on first API call (webhook may lag sign-up by seconds). */
export async function ensureProfile(userId: string): Promise<void> {
  const db = serviceClient();
  const exists = (await db.from('profiles').select('id').eq('id', userId).maybeSingle()).data;
  if (exists) return;
  const u = await (await clerkClient()).users.getUser(userId);
  await db.from('profiles').upsert({ id: u.id, display_name: [u.firstName, u.lastName].filter(Boolean).join(' ').slice(0, 80) }, { onConflict: 'id', ignoreDuplicates: true });
  await db.from('profile_private').upsert({ user_id: u.id, email: u.primaryEmailAddress?.emailAddress ?? null, mfa_enabled: u.twoFactorEnabled }, { onConflict: 'user_id', ignoreDuplicates: true });
}

/** Ban/unban mirrors to Clerk so sessions are revoked immediately. */
export async function syncClerkBan(userId: string, status: 'active' | 'suspended' | 'banned'): Promise<void> {
  const c = await clerkClient();
  if (status === 'banned' || status === 'suspended') await c.users.banUser(userId);
  else await c.users.unbanUser(userId);
}
