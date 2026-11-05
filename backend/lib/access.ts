/**
 * Shared access contract, server half (round 11).
 * OWNER: auth agent (r11/auth-api). This is the plans agent's minimal stub with the SAME API as the front end's
 * js/access.js (role, plan, can, limit), so branches merge cleanly. RLS re-checks everything in the database;
 * this layer only gives early, readable errors.
 *
 * Policy data: data/access-policy.json (byte-identical copy of the site's src/data/access-policy.json; a test
 * keeps them in sync). Limits there are DEFAULTS: live values come from public.plan_tiers (admin-editable).
 */
import policy from '../data/access-policy.json' with { type: 'json' };

export const ROLES = ['visitor', 'guest', 'learner', 'tutor', 'admin', 'root_admin'] as const;
export const PLANS = ['free', 'standard', 'plus', 'pro'] as const;
export type AccessRole = (typeof ROLES)[number];
export type PlanTier = (typeof PLANS)[number];
export type ActionKey = keyof typeof policy.actions;

interface ActionRule { roles: string[]; minPlan?: string; limit?: string; approval?: boolean; requires?: string }
type Limits = Record<string, number | boolean | null>;

const ACTIONS = policy.actions as Record<string, ActionRule>;
const LIMITS = policy.limits as Record<string, Record<string, Limits>>;
const STAFF = new Set<string>(policy.staff);

export const planRank = (p: string | null | undefined): number => Math.max(0, PLANS.indexOf((p ?? 'free') as PlanTier));
export const isStaff = (r: AccessRole): boolean => STAFF.has(r);

/**
 * Maps the DB role list (app_role enum: learner | tutor | admin | super_admin) to the round-11 role.
 * root_admin is ONLY ever derived server-side from a verified email by the auth agent's code; the DB
 * role 'super_admin' maps to it here. A signed-in profile with no learner/tutor role is a guest.
 */
export function accessRole(signedIn: boolean, dbRoles: readonly string[] = []): AccessRole {
  if (!signedIn) return 'visitor';
  if (dbRoles.includes('root_admin') || dbRoles.includes('super_admin')) return 'root_admin';
  if (dbRoles.includes('admin')) return 'admin';
  if (dbRoles.includes('tutor')) return 'tutor';
  if (dbRoles.includes('learner')) return 'learner';
  return 'guest';
}

export function actionRule(action: string): ActionRule | undefined { return ACTIONS[action]; }

export type Denial = 'visitor' | 'guest' | 'role' | 'plan' | 'unknown_action';
export interface Decision { ok: boolean; reason?: Denial; minPlan?: PlanTier }

/** Role + plan check for one action key. Unknown keys are denied (fail closed). */
export function decide(role: AccessRole, plan: string | null | undefined, action: string): Decision {
  const rule = ACTIONS[action];
  if (!rule) return { ok: false, reason: 'unknown_action' };
  if (!rule.roles.includes(role)) return { ok: false, reason: role === 'visitor' ? 'visitor' : role === 'guest' ? 'guest' : 'role' };
  if (rule.minPlan && !isStaff(role) && planRank(plan) < planRank(rule.minPlan)) return { ok: false, reason: 'plan', minPlan: rule.minPlan as PlanTier };
  return { ok: true };
}
export const can = (role: AccessRole, plan: string | null | undefined, action: string): boolean => decide(role, plan, action).ok;

/** Default limit for role+plan (null = unlimited). Staff are never limited. `overrides` = live plan_tiers.limits. */
export function limit(role: AccessRole, plan: string | null | undefined, key: string, overrides?: Limits | null): number | boolean | null {
  if (isStaff(role)) return null;
  if (overrides && key in overrides) return overrides[key] ?? null;
  const table = LIMITS[role === 'visitor' ? 'guest' : role] ?? LIMITS.guest;
  const row = table?.[plan ?? 'free'] ?? table?.free;
  if (!row || !(key in row)) return 0;     // unknown key → most restrictive
  return row[key] ?? null;
}

/** Is `used` still under the cap? null cap = unlimited. */
export function underLimit(cap: number | boolean | null, used: number): boolean {
  if (cap === null || cap === true) return true;
  if (cap === false) return false;
  return used < cap;
}

/** Front-end redirect target for a denial (mirrors policy.redirects). */
export function redirectFor(d: Decision, next: string): string | null {
  if (d.ok) return null;
  const n = encodeURIComponent(next);
  if (d.reason === 'visitor') return policy.redirects.visitor.replace('{next}', n);
  if (d.reason === 'guest') return policy.redirects.guest.replace('{next}', n);
  if (d.reason === 'plan') return policy.redirects.plan.replace('{plan}', d.minPlan ?? 'standard').replace('{next}', n);
  return null;
}

export const POLICY_VERSION: string = policy.version;
