/**
 * Shared access contract — server half (round 11, owner: auth).
 *
 * Mirrors the front end's src/data/access-policy.json + js/access.js. The policy itself lives in
 * backend/data/access-policy.json (a byte-for-byte copy of the front-end file; tests/access.test.ts fails if
 * lib/access-policy.ts drifts from it). Pure module: no server imports, so it is unit-tested directly.
 *
 * Rules that never bend:
 *  - The role comes from the DATABASE (user_roles) and the VERIFIED Clerk email, never from request bodies,
 *    headers, query strings or Clerk unsafeMetadata.
 *  - root_admin = the stored `super_admin` role AND a verified primary email equal to POLICY.root_email.
 *    A super_admin row on any other account is ignored here (and blocked by the DB trigger in the r11 migration).
 *  - Unknown actions are denied (fail closed).
 */
import { POLICY } from './access-policy.ts';

export type Role = 'visitor' | 'guest' | 'learner' | 'tutor' | 'admin' | 'root_admin';
export type Plan = 'free' | 'standard' | 'plus' | 'pro';
export type Denial = 'signin' | 'role' | 'plan' | 'minor' | 'consent';
export type MinorRule = 'deny' | 'consent';
export interface ActionRule { roles: readonly string[]; plans?: readonly string[]; minor?: MinorRule }
export interface AccessCtx { role: Role; plan?: Plan | null; minor?: boolean; consent?: boolean }

export const ROLES = POLICY.roles as readonly Role[];
export const PLANS = POLICY.plans as readonly Plan[];
export const ROOT_EMAIL: string = POLICY.root_email.toLowerCase();

const actions = POLICY.actions as unknown as Record<string, ActionRule | string>;
export function rule(action: string): ActionRule | null {
  const r = Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : undefined;
  return r && typeof r === 'object' && Array.isArray(r.roles) ? r : null;
}
export const isStaff = (r: Role): boolean => (POLICY.staff as readonly string[]).includes(r);

/** Same decision as CCAccess.why() in js/access.js. null = allowed. */
export function decide(ctx: AccessCtx, action: string): Denial | null {
  const r = rule(action);
  if (!r) return 'role';
  if (!r.roles.includes(ctx.role)) return ctx.role === 'visitor' ? 'signin' : 'role';
  if (r.minor === 'deny' && ctx.minor) return 'minor';
  if (r.minor === 'consent' && ctx.minor && ctx.consent === false) return 'consent';
  if (r.plans && !isStaff(ctx.role) && !r.plans.includes(ctx.plan ?? 'free')) return 'plan';
  return null;
}
export const can = (ctx: AccessCtx, action: string): boolean => decide(ctx, action) === null;

type LimitTable = Record<string, Record<string, Record<string, number | boolean | null>>>;
/** Default limit for a role/plan; admin-edited plan settings override these (pass them as `overrides`). */
export function limit(ctx: AccessCtx, key: string, overrides?: Record<string, number | boolean | null> | null): number | boolean | null {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key] ?? null;
  const byRole = (POLICY.limits as unknown as LimitTable)[ctx.role];
  if (!byRole) return null;
  const byPlan = byRole[ctx.plan ?? 'free'] ?? byRole.free ?? {};
  return Object.prototype.hasOwnProperty.call(byPlan, key) ? (byPlan[key] ?? null) : null;
}
export function limitsFor(ctx: AccessCtx, overrides?: Record<string, number | boolean | null> | null): Record<string, number | boolean | null> {
  const byRole = (POLICY.limits as unknown as LimitTable)[ctx.role];
  const base = byRole ? { ...(byRole[ctx.plan ?? 'free'] ?? byRole.free ?? {}) } : {};
  return { ...base, ...(overrides ?? {}) };
}

export function homeFor(role: Role): string {
  return (POLICY.home as Record<string, string>)[role] ?? '/index.html';
}

/** Exact, case-insensitive match on a VERIFIED address. Dots / +tags never widen it. */
export function isRootEmail(email: string | null | undefined, verified: boolean): boolean {
  return Boolean(verified && typeof email === 'string' && email.trim().toLowerCase() === ROOT_EMAIL);
}

export interface RoleInputs {
  dbRoles: readonly string[];          // public.user_roles for this user (DB enum: guest | learner | tutor | admin | super_admin)
  email: string | null | undefined;    // Clerk primary email address
  emailVerified: boolean;              // Clerk verification.status === 'verified'
  onboarded: boolean;                  // onboarding_state.completed_at is set
}
/**
 * Effective role. Precedence root_admin > admin > tutor > learner > guest. A signed-in account that has not finished
 * onboarding and holds no role is a guest (least privilege) until /api/v1/auth/onboarding assigns one.
 * The verified root email is root_admin even before its DB row exists (the session route then writes the row).
 */
export function resolveRole(i: RoleInputs): Role {
  const r = new Set(i.dbRoles.map(String));
  const root = isRootEmail(i.email, i.emailVerified);
  if (root) return 'root_admin';
  if (r.has('admin') || r.has('super_admin')) return 'admin';   // a stray super_admin on a non-root email is only an admin
  if (r.has('tutor')) return 'tutor';
  if (r.has('learner')) return 'learner';
  return 'guest';
}

/** Where to send a user after sign-in: onboarding first (except staff), then their home. */
export function redirectFor(role: Role, onboarded: boolean): string {
  if (!onboarded && !isStaff(role)) return `${POLICY.auth_route}?step=path`;
  return homeFor(role);
}

/** Map a stored DB role name to the contract name (DB keeps `super_admin`; the contract calls it root_admin). */
export const contractRoleName = (dbRole: string): string => (dbRole === 'super_admin' ? 'root_admin' : dbRole);

/** Age in whole years on `today` (UTC calendar dates; no time-zone drift around midnight). */
export function ageOn(dob: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;   // 2010-02-31 etc.
  let a = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)) a--;
  return a;
}
export const ADULT_AGE = 18;
export const MIN_AGE = 5;    // same lower bound as setDateOfBirthOnce (primary-school learners join only through guardian consent)

// ---------------------------------------------------------------------------------------------------------------
// Helpers from r11/plans-api (argument order: action first). Same decision rules as decide()/limit() above.
// ---------------------------------------------------------------------------------------------------------------
type Limits = Record<string, number | boolean | null>;
export type AccessRole = Role;
export type PlanTier = Plan;
export type Ctx = AccessCtx;
export type Why = Denial | null;
const LIMITS = POLICY.limits as unknown as Record<string, Record<string, Limits>>;

export const planRank = (p: string | null | undefined): number => Math.max(0, (PLANS as readonly string[]).indexOf(p ?? 'free'));

/** DB roles -> contract role. 'super_admin' can only exist on the verified root email (DB trigger guard_root_role). */
export function accessRole(signedIn: boolean, dbRoles: readonly string[] = []): Role {
  if (!signedIn) return 'visitor';
  if (dbRoles.includes('root_admin') || dbRoles.includes('super_admin')) return 'root_admin';
  if (dbRoles.includes('admin')) return 'admin';
  if (dbRoles.includes('tutor')) return 'tutor';
  if (dbRoles.includes('learner')) return 'learner';
  return 'guest';
}
export const why = (action: string, c: AccessCtx): Why => decide(c, action);
export const canFor = (action: string, c: AccessCtx): boolean => decide(c, action) === null;

/** Cheapest plan that satisfies an action's plan rule (for "upgrade to Standard" copy). */
export function minPlanFor(action: string): Plan | null {
  const p = rule(action)?.plans; if (!p?.length) return null;
  return [...p].sort((a, b) => planRank(a) - planRank(b))[0] as Plan;
}

/** Plans-style limit: staff unlimited; unknown key = 0 (most restrictive); overrides = live plan_tiers.limits. */
export function planLimit(role: Role, plan: string | null | undefined, key: string, overrides?: Limits | null): number | boolean | null {
  if (isStaff(role)) return null;
  if (overrides && key in overrides) return overrides[key] ?? null;
  const table = LIMITS[role === 'visitor' ? 'guest' : role] ?? LIMITS.guest;
  const row = table?.[plan ?? 'free'] ?? table?.free;
  if (!row || !(key in row)) return 0;
  return row[key] ?? null;
}
export function underLimit(cap: number | boolean | null, used: number): boolean {
  if (cap === null || cap === true) return true;
  if (cap === false) return false;
  return used < cap;
}
export const POLICY_VERSION: number = Number(POLICY.version);
