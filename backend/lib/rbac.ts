/**
 * RBAC permission matrix — the server-side half of "enforced twice"
 * (the other half is RLS). Keep in sync with docs/BACKEND.md §RBAC.
 *
 * Scope semantics:
 *   'all'  → any row        'own' → rows the caller owns (checked again by RLS)
 *   'public' → published/public rows only       false → denied
 */
export type Role = 'anon' | 'learner' | 'tutor' | 'admin' | 'super_admin';
export type Action = 'read' | 'create' | 'update' | 'delete';
export type Scope = 'all' | 'own' | 'public' | false;

export type Resource =
  | 'profile' | 'course' | 'lesson' | 'course_media' | 'enrollment' | 'progress' | 'review' | 'resource' | 'news'
  | 'event' | 'registration' | 'session' | 'booking' | 'project' | 'launch' | 'test_campaign' | 'test_feedback'
  | 'competition' | 'submission' | 'group' | 'post' | 'message' | 'notification' | 'listing' | 'order'
  | 'payment' | 'invoice' | 'refund' | 'payout' | 'wallet' | 'coupon' | 'subscription' | 'job'
  | 'settings' | 'social_link' | 'feature_flag' | 'audit_log' | 'analytics' | 'user_role' | 'moderation';

type Row = Partial<Record<Action, Scope>>;
const R = (read: Scope, create: Scope, update: Scope, del: Scope): Row => ({ read, create, update, delete: del });

// learner ⊂ tutor for learning features; admin = all (except role changes / big payouts → super_admin)
export const MATRIX: Record<Resource, Record<Exclude<Role, 'super_admin'>, Row>> = {
  profile:       { anon: R('public', false, false, false), learner: R('public', false, 'own', false), tutor: R('public', false, 'own', false), admin: R('all', false, 'all', false) },
  course:        { anon: R('public', false, false, false), learner: R('public', false, false, false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', 'all') },
  lesson:        { anon: R('public', false, false, false), learner: R('own', false, false, false), tutor: R('own', 'own', 'own', 'own'), admin: R('all', 'all', 'all', 'all') },
  course_media:  { anon: R(false, false, false, false), learner: R('own', false, false, false), tutor: R('own', 'own', 'own', 'own'), admin: R('all', 'all', 'all', 'all') },
  enrollment:    { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', false) },
  progress:      { anon: R(false, false, false, false), learner: R('own', 'own', false, 'own'), tutor: R('own', 'own', false, 'own'), admin: R('all', false, false, false) },
  review:        { anon: R('public', false, false, false), learner: R('public', 'own', 'own', false), tutor: R('public', 'own', 'own', false), admin: R('all', false, 'all', 'all') },
  resource:      { anon: R('public', false, false, false), learner: R('public', false, false, false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', 'all') },
  news:          { anon: R('public', false, false, false), learner: R('public', false, false, false), tutor: R('public', false, false, false), admin: R('all', 'all', 'all', 'all') },
  event:         { anon: R('public', false, false, false), learner: R('public', false, false, false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', 'all') },
  registration:  { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', false) },
  session:       { anon: R(false, false, false, false), learner: R('public', false, false, false), tutor: R('own', 'own', 'own', 'own'), admin: R('all', 'all', 'all', 'all') },
  booking:       { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', false) },
  project:       { anon: R('public', false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', 'all') },
  launch:        { anon: R('public', false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', 'all') },
  test_campaign: { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', false) },
  test_feedback: { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', false, 'all', false) },
  competition:   { anon: R('public', false, false, false), learner: R('public', false, false, false), tutor: R('public', false, false, false), admin: R('all', 'all', 'all', 'all') },
  submission:    { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', false, 'all', false) },
  group:         { anon: R(false, false, false, false), learner: R('own', 'own', 'own', 'own'), tutor: R('own', 'own', 'own', 'own'), admin: R('all', 'all', 'all', 'all') },
  post:          { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', 'all', 'all', 'all') },
  message:       { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R(false, false, false, false) },
  notification:  { anon: R(false, false, false, false), learner: R('own', false, 'own', 'own'), tutor: R('own', false, 'own', 'own'), admin: R('own', 'all', 'own', 'own') },
  listing:       { anon: R(false, false, false, false), learner: R('public', 'own', 'own', false), tutor: R('public', 'own', 'own', false), admin: R('all', 'all', 'all', 'all') },
  order:         { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', false, 'all', false) },
  payment:       { anon: R(false, false, false, false), learner: R('own', 'own', false, false), tutor: R('own', 'own', false, false), admin: R('all', false, false, false) },
  invoice:       { anon: R(false, false, false, false), learner: R('own', false, false, false), tutor: R('own', false, false, false), admin: R('all', false, false, false) },
  refund:        { anon: R(false, false, false, false), learner: R('own', 'own', false, false), tutor: R('own', 'own', false, false), admin: R('all', 'all', 'all', false) },
  payout:        { anon: R(false, false, false, false), learner: R(false, false, false, false), tutor: R('own', 'own', false, false), admin: R('all', false, 'all', false) },
  wallet:        { anon: R(false, false, false, false), learner: R('own', false, false, false), tutor: R('own', false, false, false), admin: R('all', false, false, false) },
  coupon:        { anon: R(false, false, false, false), learner: R(false, false, false, false), tutor: R('own', 'own', 'own', 'own'), admin: R('all', 'all', 'all', 'all') },
  subscription:  { anon: R(false, false, false, false), learner: R('own', 'own', 'own', false), tutor: R('own', 'own', 'own', false), admin: R('all', false, 'all', false) },
  job:           { anon: R('public', false, false, false), learner: R('public', 'own', 'own', false), tutor: R('public', 'own', 'own', false), admin: R('all', 'all', 'all', 'all') },
  settings:      { anon: R('public', false, false, false), learner: R('public', false, false, false), tutor: R('public', false, false, false), admin: R('all', 'all', 'all', false) },
  social_link:   { anon: R('public', false, false, false), learner: R('public', false, false, false), tutor: R('public', false, false, false), admin: R('all', 'all', 'all', 'all') },
  feature_flag:  { anon: R('public', false, false, false), learner: R('public', false, false, false), tutor: R('public', false, false, false), admin: R('all', 'all', 'all', false) },
  audit_log:     { anon: R(false, false, false, false), learner: R(false, false, false, false), tutor: R(false, false, false, false), admin: R('all', false, false, false) },
  analytics:     { anon: R(false, false, false, false), learner: R(false, false, false, false), tutor: R('own', false, false, false), admin: R('all', false, false, false) },
  user_role:     { anon: R(false, false, false, false), learner: R('own', false, false, false), tutor: R('own', false, false, false), admin: R('all', false, false, false) },
  moderation:    { anon: R(false, false, false, false), learner: R('own', 'own', false, false), tutor: R('own', 'own', false, false), admin: R('all', 'all', 'all', 'all') },
};

/** super_admin-only operations (on top of admin). */
export const SUPER_ADMIN_ONLY = ['user_role:create', 'user_role:delete', 'payout:approve_over_threshold', 'settings:money'] as const;

export function effectiveRole(roles: readonly string[]): Role {
  if (roles.includes('super_admin')) return 'super_admin';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('tutor')) return 'tutor';
  if (roles.includes('learner')) return 'learner';
  return 'anon';
}

export function can(roles: readonly string[], resource: Resource, action: Action): Scope {
  const role = effectiveRole(roles);
  const row = MATRIX[resource][role === 'super_admin' ? 'admin' : role];
  return row[action] ?? false;
}
