/**
 * Shared access contract, server half (round 11).
 * OWNER: auth agent (r11/auth-api). This is the plans agent's stub with the SAME decision rules as the owner's
 * js/access.js (`why`): roles → minor → plans; staff bypass plans; unknown actions are denied (fail closed).
 * RLS re-checks everything in the database; this layer only gives early, readable errors.
 *
 * Policy data: data/access-policy.json (byte-identical copy of the site's src/data/access-policy.json; a test
 * keeps them in sync). Limits there are DEFAULTS: live values come from public.plan_tiers (admin-editable).
 */
import policy from '../data/access-policy.json' with { type: 'json' };

export const ROLES = ['visitor', 'guest', 'learner', 'tutor', 'admin', 'root_admin'] as const;
export const PLANS = ['free', 'standard', 'plus', 'pro'] as const;
export type AccessRole = (typeof ROLES)[number];
export type PlanTier = (typeof PLANS)[number];

interface ActionRule { roles: string[]; plans?: string[]; minor?: 'deny' | 'consent' }
type Limits = Record<string, number | boolean | null>;
export interface Ctx { role: AccessRole; plan?: string | null; minor?: boolean; consent?: boolean }

const ACTIONS = policy.actions as unknown as Record<string, ActionRule>;
const LIMITS = policy.limits as unknown as Record<string, Record<string, Limits>>;
const STAFF = new Set<string>(policy.staff);

export const planRank = (p: string | null | undefined): number => Math.max(0, PLANS.indexOf((p ?? 'free') as PlanTier));
export const isStaff = (r: string): boolean => STAFF.has(r);

/**
 * DB roles (app_role: learner | tutor | admin | super_admin [+ guest from r11/auth]) → round-11 role.
 * root_admin is ONLY ever granted server-side from the verified email (owner: auth); here 'super_admin' maps to it.
 */
export function accessRole(signedIn: boolean, dbRoles: readonly string[] = []): AccessRole {
  if (!signedIn) return 'visitor';
  if (dbRoles.includes('root_admin') || dbRoles.includes('super_admin')) return 'root_admin';
  if (dbRoles.includes('admin')) return 'admin';
  if (dbRoles.includes('tutor')) return 'tutor';
  if (dbRoles.includes('learner')) return 'learner';
  return 'guest';
}

export type Why = null | 'signin' | 'role' | 'plan' | 'minor' | 'consent';

/** Same order as the owner's client `why()`. */
export function why(action: string, c: Ctx): Why {
  const rule = ACTIONS[action];
  if (!rule || !Array.isArray(rule.roles)) return 'role';
  if (!rule.roles.includes(c.role)) return c.role === 'visitor' ? 'signin' : 'role';
  if (rule.minor === 'deny' && c.minor) return 'minor';
  if (rule.minor === 'consent' && c.minor && c.consent === false) return 'consent';
  if (rule.plans && !isStaff(c.role) && !rule.plans.includes(c.plan ?? 'free')) return 'plan';
  return null;
}
export const can = (action: string, c: Ctx): boolean => why(action, c) === null;

/** Cheapest plan that satisfies an action's plan rule (for "upgrade to Standard" copy). */
export function minPlanFor(action: string): PlanTier | null {
  const p = ACTIONS[action]?.plans; if (!p?.length) return null;
  return [...p].sort((a, b) => planRank(a) - planRank(b))[0] as PlanTier;
}

/** Default limit (null = unlimited). Staff are never limited. `overrides` = live plan_tiers.limits from the DB. */
export function limit(role: AccessRole, plan: string | null | undefined, key: string, overrides?: Limits | null): number | boolean | null {
  if (isStaff(role)) return null;
  if (overrides && key in overrides) return overrides[key] ?? null;
  const table = LIMITS[role === 'visitor' ? 'guest' : role] ?? LIMITS.guest;
  const row = table?.[plan ?? 'free'] ?? table?.free;
  if (!row || !(key in row)) return 0;     // unknown key → most restrictive
  return row[key] ?? null;
}
export function underLimit(cap: number | boolean | null, used: number): boolean {
  if (cap === null || cap === true) return true;
  if (cap === false) return false;
  return used < cap;
}

export const POLICY_VERSION: number = policy.version;
