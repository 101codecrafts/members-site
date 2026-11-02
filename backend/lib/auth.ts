import 'server-only';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { AppError, forbidden, unauthenticated } from '@/lib/errors';
import { anonClient, userClient, type Db } from '@/lib/supabase/user';
import { can, effectiveRole, type Action, type Resource, type Role } from '@/lib/rbac';
import { env } from '@/lib/env';

export interface Session {
  userId: string;
  token: string;
  db: Db;                 // RLS-scoped client acting as this user
  roles: string[];
  role: Role;
  accountStatus: string | null;
  tutorVerified: boolean;
  mfaEnabled: boolean;
}

interface AccessRow { user_id: string | null; roles: string[]; account_status: string | null; tutor_verification: string | null; mfa_enabled: boolean }

/**
 * Verifies the Clerk session on EVERY call. Works for cookies (web) and
 * `Authorization: Bearer <session token>` (native apps via Clerk Expo).
 */
export async function getSession(): Promise<Session | null> {
  const a = await auth();
  if (!a.userId) return null;
  const token = await a.getToken();
  if (!token) return null;
  const db = userClient(token);
  const { data, error } = await db.rpc('my_access');
  if (error) throw error;
  const acc = (data ?? {}) as unknown as AccessRow;
  const roles = Array.isArray(acc.roles) ? acc.roles : [];
  return {
    userId: a.userId, token, db, roles, role: effectiveRole(roles),
    accountStatus: acc.account_status ?? null,
    tutorVerified: acc.tutor_verification === 'verified',
    mfaEnabled: Boolean(acc.mfa_enabled),
  };
}

export async function optionalSession(): Promise<{ session: Session | null; db: Db }> {
  const session = await getSession();
  return { session, db: session?.db ?? anonClient() };
}

export async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s) throw unauthenticated();
  if (s.accountStatus === 'banned' || s.accountStatus === 'suspended') throw forbidden(`Account ${s.accountStatus}`);
  return s;
}

/** Active (approved) account: learner/tutor/admin features. */
export async function requireMember(): Promise<Session> {
  const s = await requireUser();
  if (s.accountStatus !== 'active') throw forbidden('Your membership is not active yet');
  return s;
}

async function assertMfa(s: Session): Promise<void> {
  if (env().REQUIRE_MFA_FOR_STAFF !== 'true') return;
  if (s.mfaEnabled) return;
  // fall back to Clerk (mirror may lag the webhook)
  const user = await (await clerkClient()).users.getUser(s.userId);
  if (!user.twoFactorEnabled) throw new AppError('mfa_required', 'Enable two-factor authentication to use staff features');
}

export async function requireTutor(): Promise<Session> {
  const s = await requireMember();
  if (!s.roles.includes('tutor') || !s.tutorVerified) throw forbidden('Verified tutors only');
  await assertMfa(s);
  return s;
}

export async function requireAdmin(opts: { superAdmin?: boolean } = {}): Promise<Session> {
  const s = await requireMember();
  const ok = opts.superAdmin ? s.roles.includes('super_admin') : s.roles.includes('admin') || s.roles.includes('super_admin');
  if (!ok) throw forbidden(opts.superAdmin ? 'super_admin only' : 'Admins only');
  await assertMfa(s);
  return s;
}

/** Matrix check (first enforcement layer). RLS re-checks ownership in the DB. */
export function authorize(s: Session | null, resource: Resource, action: Action): void {
  const scope = can(s?.roles ?? [], resource, action);
  if (scope === false) throw s ? forbidden() : unauthenticated();
}
