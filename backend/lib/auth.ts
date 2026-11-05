import 'server-only';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { AppError, forbidden, unauthenticated } from '@/lib/errors';
import { anonClient, userClient, type Db } from '@/lib/supabase/user';
import { can, effectiveRole, type Action, type Resource, type Role } from '@/lib/rbac';
import { env } from '@/lib/env';
import { decide, type AccessCtx, type Plan, type Role as ContractRole } from '@/lib/access';
import { createLogger } from '@/lib/logger';

export interface Session {
  userId: string;
  token: string;
  db: Db;                 // RLS-scoped client acting as this user
  roles: string[];
  role: Role;
  accountStatus: string | null;
  tutorVerified: boolean;
  mfaEnabled: boolean;
  minor: boolean;          // r11: profiles.is_minor (from DOB, server-derived)
  guardianConsent: boolean; // r11: a verified, unrevoked guardian consent exists
}

interface AccessRow { user_id: string | null; roles: string[]; account_status: string | null; tutor_verification: string | null; mfa_enabled: boolean; is_minor?: boolean; guardian_consent?: boolean }

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
    minor: Boolean(acc.is_minor), guardianConsent: Boolean(acc.guardian_consent),
  };
}

/**
 * Public routes: a signed-in caller gets their RLS-scoped client, but if the
 * token check or the my_access lookup fails (e.g. the DB cannot verify the
 * JWT), fall back to anonymous instead of failing the whole public request.
 * Routes that need a user use requireUser/requireMember, which still throw.
 */
export async function optionalSession(): Promise<{ session: Session | null; db: Db }> {
  try {
    const session = await getSession();
    return { session, db: session?.db ?? anonClient() };
  } catch (err) {
    createLogger({ mod: 'auth' }).warn('optionalSession: session check failed, continuing as anonymous', {
      error: err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err),
    });
    return { session: null, db: anonClient() };
  }
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

/**
 * r11 shared access contract on the server: the same action keys as js/access.js (src/data/access-policy.json).
 * Role from user_roles only (super_admin exists solely on the verified root email: DB trigger guard_root_role).
 * Usage in a route: `const s = await requireCan('market.sell');`
 */
export function accessCtx(s: Session | null, plan: Plan = 'free'): AccessCtx {
  if (!s) return { role: 'visitor' };
  const r = new Set(s.roles);
  const role: ContractRole = r.has('super_admin') ? 'root_admin' : r.has('admin') ? 'admin' : r.has('tutor') ? 'tutor' : r.has('learner') ? 'learner' : 'guest';
  return { role, plan, minor: s.minor, consent: !s.minor || s.guardianConsent };
}
export async function requireCan(action: string, plan: Plan = 'free'): Promise<Session> {
  const s = await getSession();
  const why = decide(accessCtx(s, plan), action);
  if (why === 'signin') throw unauthenticated();
  if (!s) throw unauthenticated();
  if (s.accountStatus === 'banned' || s.accountStatus === 'suspended') throw forbidden(`Account ${s.accountStatus}`);
  if (why) throw new AppError('forbidden', why === 'plan' ? 'Upgrade your plan to use this' : why === 'consent' ? 'A parent or guardian must approve this first' : why === 'minor' ? 'Not available for under-18 accounts' : 'You do not have access to this', { reason: why, action });
  return s;
}
