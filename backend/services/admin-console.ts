import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import type { Session } from '@/lib/auth';
import type { z } from 'zod';
import type { queueQuery } from '@/lib/admin-validation';
import { serviceClient } from '@/lib/supabase/admin';
import { AppError, forbidden } from '@/lib/errors';
import { env } from '@/lib/env';
import { sendEmails, templates } from '@/lib/email';
import { createLogger } from '@/lib/logger';
import type { Db } from '@/lib/supabase/user';
import { rpc, type RpcArgs } from '@/repositories/rpc';
import type { Database } from '@/types/database';
type Fns = Database['public']['Functions'];

/**
 * Round 11 admin console services.
 *  - Root (contract role root_admin) is ONLY 101codecrafts@gmail.com, bound in the DB to one Clerk user id from the
 *    Clerk-VERIFIED primary email (backend_bind_root). Never from client input.
 *  - Invites: root invites by email; the raw token travels once (email link / copy link); accept checks the invitee's
 *    Clerk-verified email against the invite in the DB.
 *  - Scopes are enforced in SQL (app.require_scope), including the plans-branch RPCs since 20261105040000
 *    (admin_update_plan / admin_set_course_pricing: 'plans'; decide_course_price: 'approvals'). Routes also call
 *    requireScope here so a missing scope is a clean 403 before any RPC runs.
 */
const log = createLogger({ mod: 'admin-console' });
export const ROOT_EMAIL = '101codecrafts@gmail.com';

/** Typed RPC call: the name and args are checked against types/database.ts (regenerated from staging, round 12). */
export async function call<T = unknown, N extends keyof Fns = keyof Fns>(db: Db, name: N, args: RpcArgs<N> = {} as RpcArgs<N>): Promise<T> {
  return (await rpc(db, name, args)) as T;
}
/** Same, but a missing function/table (migration of another branch not applied yet) returns `fallback`. */
export async function callOptional<T, N extends keyof Fns = keyof Fns>(db: Db, name: N, args: RpcArgs<N>, fallback: T): Promise<{ data: T; available: boolean }> {
  try { return { data: await call<T, N>(db, name, args), available: true }; }
  catch (e) {
    const code = (e as { code?: string }).code;
    if (code === '42883' || code === 'PGRST202' || code === '42P01' || code === 'PGRST205') return { data: fallback, available: false };
    throw e;
  }
}

export interface ClerkEmail { email: string | null; verified: boolean; name: string }
export async function verifiedEmail(userId: string): Promise<ClerkEmail> {
  const u = await (await clerkClient()).users.getUser(userId);
  const p = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
  return { email: p?.emailAddress?.toLowerCase() ?? null, verified: p?.verification?.status === 'verified',
           name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || '' };
}

export interface AdminMe { user_id: string; is_admin: boolean; is_root: boolean; role: 'root_admin' | 'admin' | null; scopes: string[]; all_scopes: string[] }

/** Console bootstrap: binds root when the verified root email signs in, then returns role + scopes. */
export async function adminMe(s: Session): Promise<AdminMe> {
  let me = await call<AdminMe>(s.db, 'admin_me');
  if (!me.is_root) {
    const id = await verifiedEmail(s.userId).catch(() => null);
    if (id?.verified && id.email === ROOT_EMAIL) {
      await call(serviceClient(), 'backend_bind_root', { p_user: s.userId, p_verified_email: id.email });
      log.info('root bound', { user: s.userId });
      me = await call<AdminMe>(s.db, 'admin_me');
    }
  }
  return me;
}

export async function requireScope(s: Session, scope: string): Promise<AdminMe> {
  const me = await call<AdminMe>(s.db, 'admin_me');
  if (!me.is_admin || !(me.is_root || me.scopes.includes(scope))) throw forbidden(`admin scope "${scope}" required`);
  return me;
}

export async function invite(s: Session, email: string, scopes: string[]) {
  const r = await call<{ id: string; email: string; scopes: string[]; expires_at: string; token: string }>(s.db, 'admin_invite', { p_email: email, p_scopes: scopes });
  const e = env();
  const url = `${e.APP_URL.replace(/\/$/, '')}/admin.html#accept=${r.token}`;
  const inviter = (await verifiedEmail(s.userId).catch(() => null))?.name || '101 Codecrafts';
  let emailed = false;
  if (e.RESEND_API_KEY) {
    emailed = (await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, [{ to: r.email, ...templates.adminInvite({ inviter, url, scopes: r.scopes, expires: new Date(r.expires_at).toUTCString() }) }]).catch(() => 0)) > 0;
  }
  // The link goes back to root (the inviter) only when no email could be sent, so root can pass it on privately.
  return { id: r.id, email: r.email, scopes: r.scopes, expires_at: r.expires_at, emailed, accept_url: emailed ? null : url };
}

export async function acceptInvite(s: Session, token: string) {
  const id = await verifiedEmail(s.userId);
  if (!id.email || !id.verified) throw new AppError('forbidden', 'Verify your email address first, then accept the invite');
  return call(serviceClient(), 'backend_accept_admin_invite', { p_user: s.userId, p_verified_email: id.email, p_token: token });
}

/** Queue = review_submissions + (when the plans branch is merged) pending course_price_requests as kind 'price_change'. */
export async function approvalQueue(s: Session, p: z.infer<typeof queueQuery>) {
  const q = await call<{ total: number; counts: Record<string, number>; items: unknown[] }>(s.db, 'admin_review_queue',
    { p_status: p.status, p_kind: p.kind && p.kind !== 'price_change' ? p.kind : null, p_limit: p.limit, p_offset: p.offset });
  let prices: unknown[] = []; let pricesAvailable = false;
  if (p.status === 'pending' && (!p.kind || p.kind === 'price_change')) {
    const r = await s.db.from('course_price_requests').select('id, course_id, tutor_id, make_free, price_ugx, note, status, created_at').eq('status', 'pending').order('created_at').limit(100);
    if (!r.error) {
      pricesAvailable = true;
      const rows = (r.data ?? []) as unknown as { id: string; course_id: string; tutor_id: string; make_free: boolean; price_ugx: number | null; note: string | null; created_at: string }[];
      const courses = rows.length ? ((await s.db.from('courses').select('id, title, is_free, price_ugx').in('id', rows.map((x) => x.course_id))).data ?? []) : [];
      const people = rows.length ? ((await s.db.from('profiles').select('id, display_name, username').in('id', rows.map((x) => x.tutor_id))).data ?? []) : [];
      prices = rows.map((x) => {
        const c = courses.find((y) => y.id === x.course_id); const who = people.find((y) => y.id === x.tutor_id);
        return { id: 'price:' + x.id, kind: 'price_change', entity_ref: x.course_id, title: `Price: ${c?.title ?? 'course'}`, summary: x.note, status: 'pending',
          payload: { course_id: x.course_id, from: c ? { is_free: c.is_free, price_ugx: c.price_ugx } : null, to: { is_free: x.make_free, price_ugx: x.price_ugx } },
          urls: [], risk_level: 'low', risk_flags: [], version: 1, created_at: x.created_at, submitter: { id: x.tutor_id, display_name: who?.display_name ?? '', username: who?.username ?? null } };
      });
    }
  }
  return { ...q, total: q.total + prices.length, counts: { ...q.counts, ...(prices.length ? { price_change: prices.length } : {}) },
           items: [...(prices as unknown[]), ...q.items], price_requests_available: pricesAvailable };
}

export async function decide(s: Session, id: string, decision: 'approve' | 'reject' | 'request_changes', reason?: string | null, fixes?: string[]) {
  if (id.startsWith('price:')) {
    await requireScope(s, 'approvals');
    if (decision === 'request_changes') throw new AppError('bad_request', 'Price requests are approved or rejected');
    return call(s.db, 'decide_course_price', { p_request: id.slice(6), p_approve: decision === 'approve', p_note: reason ?? null });
  }
  return call(s.db, 'admin_decide_submission', { p_id: id, p_decision: decision, p_reason: reason ?? null, p_fixes: fixes ?? [] });
}
