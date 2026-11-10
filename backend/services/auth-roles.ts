import 'server-only';
/**
 * Round 11: server-side role assignment + the /auth onboarding flow.
 *
 *  - The role is decided HERE from the DB and the VERIFIED Clerk email (lib/access.resolveRole). Nothing the browser
 *    sends can name a role: onboarding bodies are strict zod schemas, and the path only selects which application
 *    the server opens (guest / learner / tutor-pending-verification).
 *  - 101codecrafts@gmail.com with a verified address becomes root_admin (stored as super_admin + admin) on its first
 *    session call; the DB trigger in 20261105000100_auth_roles_r11.sql refuses super_admin for any other email.
 *  - Disposable / temp-mail addresses are rejected on EVERY path (services/email-guard.checkEmail, the same guard the
 *    Clerk webhook and POST /auth/email-check use).
 *  - Under 18 (DOB, computed server-side): guardian consent record + email to the guardian; the account stays pending
 *    and restricted until the guardian verifies. Tutors must be 18+.
 *  - Clerk publicMetadata.role is a read-only MIRROR written by this server for UI hints; it is never read back as truth.
 */
import { clerkClient } from '@clerk/nextjs/server';
import type { Session } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { AppError, forbidden } from '@/lib/errors';
import { encryptSecret, sha256, randomToken } from '@/lib/crypto';
import { env } from '@/lib/env';
import { sendEmails, templates } from '@/lib/email';
import { checkEmail } from '@/services/email-guard';
import { rpc } from '@/repositories/rpc';
import { ADULT_AGE, MIN_AGE, ageOn, contractRoleName, isRootEmail, limitsFor, redirectFor, resolveRole, type Plan, type Role } from '@/lib/access';
import { CONSENT_VERSION, stripForMinor, tutorStatus, type TutorStatus, type OnboardingDraft, type OnboardingSubmit } from '@/lib/onboarding';


/* ---- pre-migration tolerance -------------------------------------------------------------------------------------
 * The r11 migration (guest enum value, onboarding path/step/draft, consent evidence, tutor fields) is applied by the
 * founder. Until then these helpers fall back to the legacy columns so the flow still works on the current staging DB.
 * Only "schema not there yet" errors fall back; every other error is thrown. */
const SCHEMA_GAP = new Set(['42703', 'PGRST204', '42P01', 'PGRST205', '22P02']);
type PgErr = { code?: string; message?: string } | null;
const isGap = (e: PgErr): boolean => Boolean(e && ((e.code && SCHEMA_GAP.has(e.code)) || /column .* does not exist|could not find the .* column|invalid input value for enum/i.test(e.message ?? '')));
const LEGACY_ONBOARDING = new Set(['user_id', 'email_verified', 'intended_role', 'interests', 'experience_level', 'learning_path_id', 'goals', 'steps_completed', 'completed_at']);
type Row = Record<string, unknown>;
async function upsertOnboarding(row: Row): Promise<void> {
  const db = serviceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = db.from('onboarding_state') as any;
  let { error } = await t.upsert(row, { onConflict: 'user_id' });
  if (error && isGap(error)) ({ error } = await t.upsert(Object.fromEntries(Object.entries(row).filter(([k]) => LEGACY_ONBOARDING.has(k))), { onConflict: 'user_id' }));
  if (error) throw error;
}
async function tolerantWrite(run: (r: Row) => PromiseLike<{ error: PgErr }>, row: Row, legacyKeys: string[] | null): Promise<boolean> {
  let { error } = await run(row);
  if (error && isGap(error)) {
    if (!legacyKeys) return false;                                   // table not there yet: skip (logged by caller if needed)
    ({ error } = await run(Object.fromEntries(Object.entries(row).filter(([k]) => legacyKeys.includes(k)))));
  }
  if (error) throw error;
  return true;
}

export interface ClerkIdentity { email: string | null; emailVerified: boolean; name: string; image: string | null }

export async function clerkIdentity(userId: string): Promise<ClerkIdentity> {
  const u = await (await clerkClient()).users.getUser(userId);
  const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
  return {
    email: primary?.emailAddress ?? null,
    emailVerified: primary?.verification?.status === 'verified',
    name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || '',
    image: u.hasImage && u.imageUrl?.startsWith('https://') ? u.imageUrl : null,
  };
}

type DbRole = "learner" | "tutor" | "admin" | "super_admin" | "guest";
async function grant(userId: string, roles: DbRole[], by: string | null = null): Promise<void> {
  const db = serviceClient();
  for (const role of roles) {
    const { error } = await db.from('user_roles').upsert({ user_id: userId, role, granted_by: by }, { onConflict: 'user_id,role', ignoreDuplicates: true });
    if (error && role === 'guest' && isGap(error)) continue;          // pre-migration: no 'guest' enum value; no role row = guest anyway
    if (error) throw error;
  }
}

async function mirrorClerkRole(userId: string, role: Role): Promise<void> {
  try { await (await clerkClient()).users.updateUserMetadata(userId, { publicMetadata: { role } }); } catch { /* mirror only */ }
}

/** Root: a verified 101codecrafts@gmail.com always ends up super_admin + admin, active and onboarded. */
async function ensureRoot(userId: string, id: ClerkIdentity): Promise<void> {
  const db = serviceClient();
  await db.from('profile_private').upsert({ user_id: userId, email: id.email }, { onConflict: 'user_id' });
  await upsertOnboarding({ user_id: userId, email_verified: true, path: 'admin', completed_at: new Date().toISOString() });
  await grant(userId, ['super_admin', 'admin']);
  await db.from('profiles').update({ account_status: 'active', joined_at: new Date().toISOString() }).eq('id', userId).neq('account_status', 'active');
}

export interface SessionView {
  user: { id: string; email: string | null; name: string; image: string | null };
  role: Role; roles: string[]; plan: Plan; minor: boolean; consent: boolean; status: string | null;
  onboarding: { path: string | null; step: string | null; completed: boolean; draft: OnboardingDraft | null };
  guardian: { status: 'not_needed' | 'pending' | 'verified' };
  /** r13 flows: what the tutor dashboard needs to explain "pending verification" instead of a dead-end builder. */
  tutor: TutorStatus | null;
  /** r13 flows: seller readiness (store + KYC) so the seller centre can say what is missing; null = no store yet. */
  store: { name: string; kyc_status: string } | null;
  limits: Record<string, number | boolean | null>;
  redirect: string;
}

/** GET /api/v1/auth/session — the ONLY source of role/plan for js/access.js. */
export async function sessionView(s: Session): Promise<SessionView> {
  const id = await clerkIdentity(s.userId);
  const db = serviceClient();
  if (isRootEmail(id.email, id.emailVerified) && !s.roles.includes('super_admin')) await ensureRoot(s.userId, id);
  const [rolesQ, ob, prof, consentQ, planQ, tprof, tapp, storeQ] = await Promise.all([
    db.from('user_roles').select('role').eq('user_id', s.userId),
    db.from('onboarding_state').select('path, step, draft, completed_at').eq('user_id', s.userId).maybeSingle()
      .then(async (r) => (r.error && isGap(r.error) ? { data: { path: null, step: null, draft: null, ...((await db.from('onboarding_state').select('completed_at').eq('user_id', s.userId).maybeSingle()).data ?? {}) }, error: null } : r)),
    db.from('profiles').select('account_status, is_minor').eq('id', s.userId).maybeSingle(),
    db.from('guardian_consents').select('verified_at, revoked_at').eq('user_id', s.userId).order('created_at', { ascending: false }).limit(1),
    rpc(s.db, 'my_plan').catch(() => null),
    db.from('tutor_profiles').select('verification_status').eq('user_id', s.userId).maybeSingle().then((r) => r, () => ({ data: null })),
    db.from('tutor_applications').select('status, review_note, created_at').eq('user_id', s.userId).order('created_at', { ascending: false }).limit(1).then((r) => r, () => ({ data: null })),
    db.from('mkt_stores').select('name, kyc_status').eq('owner_id', s.userId).limit(1).then((r) => r, () => ({ data: null })),
  ]);
  const dbRoles = (rolesQ.data ?? []).map((r: { role: string }) => String(r.role));
  const onboarded = Boolean(ob.data?.completed_at);
  const role = resolveRole({ dbRoles, email: id.email, emailVerified: id.emailVerified, onboarded });
  const minor = Boolean(prof.data?.is_minor);
  const c = consentQ.data?.[0];
  const consent = !minor || Boolean(c?.verified_at && !c?.revoked_at);
  const rawPlan = (planQ as { plan?: string } | null)?.plan;
  const plan: Plan = rawPlan === 'standard' || rawPlan === 'plus' || rawPlan === 'pro' ? rawPlan : 'free';
  void mirrorClerkRole(s.userId, role);
  const tutor = tutorStatus(dbRoles, (tprof as { data?: { verification_status?: string } | null }).data ?? null,
    ((tapp as { data?: Array<{ status?: string; review_note?: string | null; created_at?: string }> | null }).data ?? [])[0] ?? null);
  const st = ((storeQ as { data?: Array<{ name?: string; kyc_status?: string }> | null }).data ?? [])[0];
  return {
    user: { id: s.userId, email: id.email, name: id.name, image: id.image },
    role, roles: dbRoles.map(contractRoleName), plan, minor, consent, status: prof.data?.account_status ?? s.accountStatus,
    onboarding: { path: ob.data?.path ?? null, step: ob.data?.step ?? null, completed: onboarded, draft: (ob.data?.draft as OnboardingDraft | null) ?? null },
    guardian: { status: !minor ? 'not_needed' : consent ? 'verified' : 'pending' },
    tutor,
    store: st ? { name: String(st.name ?? ''), kyc_status: String(st.kyc_status ?? 'pending') } : null,
    limits: limitsFor({ role, plan }),
    redirect: redirectFor(role, onboarded || role === 'root_admin'),
  };
}

/** PUT /api/v1/auth/onboarding/draft — save-and-resume across reloads and devices. */
export async function saveDraft(s: Session, d: OnboardingDraft): Promise<{ saved: true }> {
  const db = serviceClient();
  const minor = Boolean((await db.from('profiles').select('is_minor').eq('id', s.userId).maybeSingle()).data?.is_minor);
  const dob = typeof d.data?.dob === 'string' ? d.data.dob : null;
  const looksMinor = minor || (dob !== null && (ageOn(dob) ?? 99) < ADULT_AGE);
  const draft = looksMinor ? stripForMinor(d) : d;
  const { error } = await db.from('onboarding_state').upsert({ user_id: s.userId, path: d.path, step: d.step, draft }, { onConflict: 'user_id' });
  if (error && isGap(error)) return { saved: false, reason: 'pending_migration' } as unknown as { saved: true };   // the browser copy still resumes
  if (error) throw error;
  return { saved: true };
}

async function guardEmail(userId: string, id: ClerkIdentity, ipHash?: string): Promise<void> {
  if (!id.email || !id.emailVerified) throw new AppError('forbidden', 'Verify your email address first');
  const v = await checkEmail(id.email, { userId, ipHash });
  if (!v.ok) throw new AppError('forbidden', v.reason === 'disposable' ? 'Temporary or disposable email addresses are not allowed. Use your own email.' : `This email address can't be used (${v.reason}).`);
}

function age(dob: string): number {
  const a = ageOn(dob);
  if (a === null || a < MIN_AGE || a > 100) throw new AppError('bad_request', 'Enter a real date of birth');
  return a;
}

/** POST /api/v1/auth/onboarding — the server assigns the role for the chosen path. */
export async function submitOnboarding(s: Session, input: OnboardingSubmit, ipHash?: string) {
  const id = await clerkIdentity(s.userId);
  await guardEmail(s.userId, id, ipHash);
  const db = serviceClient();
  const now = new Date().toISOString();
  if (isRootEmail(id.email, id.emailVerified)) { await ensureRoot(s.userId, id); return { role: 'root_admin' as Role, redirect: redirectFor('root_admin', true), guardian: 'not_needed' }; }
  const consentRow = { consent_version: CONSENT_VERSION, terms_accepted_at: now };

  if (input.path === 'guest') {
    // r13 flows (L31/LG4): DOB for every account. Under 18 cannot be a guest (no guardian path there): join as a learner.
    const gYears = age(input.dob);
    if (gYears < ADULT_AGE) throw new AppError('bad_request', 'Under 18: join as a learner so a parent or guardian can approve your account', { field: 'dob', path: 'learner' });
    const gCur = (await db.from('profile_private').select('date_of_birth').eq('user_id', s.userId).maybeSingle()).data;
    if (gCur?.date_of_birth && gCur.date_of_birth !== input.dob) throw new AppError('bad_request', 'Your date of birth is already on file. Ask an admin to correct it.');
    await db.from('profile_private').upsert({ user_id: s.userId, email: id.email, date_of_birth: input.dob }, { onConflict: 'user_id' });
    await grant(s.userId, ['guest']);
    await upsertOnboarding({ user_id: s.userId, path: 'guest', step: 'done', draft: null, completed_at: now, ...consentRow });
    await db.from('profiles').update({ account_status: 'active', joined_at: now }).eq('id', s.userId).eq('account_status', 'pending');
    void mirrorClerkRole(s.userId, 'guest');
    return { role: 'guest' as Role, redirect: redirectFor('guest', true), guardian: 'not_needed' };
  }

  const years = age(input.dob);
  const minor = years < ADULT_AGE;
  if (input.path === 'tutor' && minor) throw forbidden('Tutors must be 18 or older. You can join as a learner.');
  if (input.path === 'learner' && minor && !input.guardian) throw new AppError('bad_request', 'Under 18: add a parent or guardian so they can approve your account', { field: 'guardian' });
  if (minor && input.path === 'learner' && input.guardian && id.email && input.guardian.email.trim().toLowerCase() === id.email.toLowerCase())
    throw new AppError('bad_request', "Your guardian's email must be different from yours", { field: 'guardian.email' });

  // DOB once (guard_dob blocks later changes); the trigger derives profiles.is_minor from it
  const cur = (await db.from('profile_private').select('date_of_birth').eq('user_id', s.userId).maybeSingle()).data;
  if (cur?.date_of_birth && cur.date_of_birth !== input.dob) throw new AppError('bad_request', 'Your date of birth is already on file. Ask an admin to correct it.');
  await db.from('profile_private').upsert({ user_id: s.userId, email: id.email, date_of_birth: input.dob, phone: input.phone?.replace(/[^\d+]/g, '') ?? null }, { onConflict: 'user_id' });

  if (minor && input.path === 'learner' && input.guardian) {
    // DPPA s.8: keep the minimum until the guardian consents (name, DOB, guardian contact); the rest waits in the browser draft.
    await db.from('profiles').update({ display_name: input.name }).eq('id', s.userId);
    const token = randomToken(32);
    const g = input.guardian;
    const base = { user_id: s.userId, guardian_name: g.name, guardian_email: g.email, relationship: g.relationship, token_hash: sha256(token),
      token_expires_at: new Date(Date.now() + 7 * 864e5).toISOString() };
    let ins = await db.from('guardian_consents').insert({ ...base, consent_version: CONSENT_VERSION, scope: ['account', 'learning', 'community_readonly'], requested_ip_hash: ipHash ?? null }).select('id').single();
    if (ins.error && isGap(ins.error)) ins = await db.from('guardian_consents').insert(base).select('id').single();
    const { data: row, error } = ins;
    if (error) throw error;
    const e = env();
    await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, [{ to: g.email, ...templates.guardianConsent({ guardian: g.name, child: input.name, url: `${e.APP_URL}/api/v1/guardian/verify?token=${token}` }) }]);
    await grant(s.userId, ['learner']);
    await upsertOnboarding({ user_id: s.userId, path: 'learner', step: 'guardian_pending', draft: null, completed_at: now, ...consentRow });
    void mirrorClerkRole(s.userId, 'learner');
    return { role: 'learner' as Role, redirect: redirectFor('learner', true), guardian: 'pending', consent_id: row.id };
  }

  await db.from('profiles').update({ display_name: input.name, ...(input.path === 'learner' ? { education_level: input.level } : {}) }).eq('id', s.userId);

  if (input.path === 'learner') {
    await grant(s.userId, ['learner']);
    await upsertOnboarding({
      user_id: s.userId, path: 'learner', step: 'done', draft: null, completed_at: now, intended_role: 'learner',
      interests: input.interests, goals: [input.goals.join(', '), input.goal_note].filter(Boolean).join(' — ').slice(0, 1000),
      experience_level: input.experience ?? null, gender: input.gender, heard_from: input.heard_from, ...consentRow,
    });
    await db.from('profiles').update({ account_status: 'active', joined_at: now }).eq('id', s.userId).eq('account_status', 'pending');
    void mirrorClerkRole(s.userId, 'learner');
    return { role: 'learner' as Role, redirect: redirectFor('learner', true), guardian: 'not_needed' };
  }

  // tutor: role granted now (dashboard shows "pending verification"); verified-tutor powers still need an admin (app.is_tutor()).
  const e = env();
  const msisdn = input.payout_phone.replace(/^0/, '256').replace(/^\+/, '');
  const app = {
    user_id: s.userId, bio: input.bio, expertise: input.subjects.slice(0, 20), years_experience: input.years_experience,
    linkedin_url: input.linkedin_url ?? null, levels: input.levels, credentials: input.credentials,
    payout_network: input.payout_network, payout_phone_last4: msisdn.slice(-4),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const intents = db.from('tutor_payout_intents') as any;
  await tolerantWrite((r) => intents.upsert(r, { onConflict: 'user_id' }), { user_id: s.userId, network: input.payout_network, last4: msisdn.slice(-4),
    ciphertext: e.PAYOUT_ENCRYPTION_KEY ? encryptSecret(msisdn, e.PAYOUT_ENCRYPTION_KEY, e.PAYOUT_ENCRYPTION_KEY_ID) : null }, null);
  const pending = (await db.from('tutor_applications').select('id').eq('user_id', s.userId).eq('status', 'pending').maybeSingle()).data;
  const legacyApp = ['user_id', 'bio', 'expertise', 'years_experience', 'linkedin_url'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apps = db.from('tutor_applications') as any;
  await tolerantWrite((r) => (pending ? apps.update(r).eq('id', pending.id) : apps.insert(r)), app, legacyApp);
  await grant(s.userId, ['learner', 'tutor']);
  await upsertOnboarding({ user_id: s.userId, path: 'tutor', step: 'done', draft: null, completed_at: now, intended_role: 'tutor', gender: input.gender, heard_from: input.heard_from, ...consentRow });
  await db.from('profiles').update({ account_status: 'active', joined_at: now }).eq('id', s.userId).eq('account_status', 'pending');
  void mirrorClerkRole(s.userId, 'tutor');
  return { role: 'tutor' as Role, redirect: redirectFor('tutor', true), guardian: 'not_needed', tutor_verification: 'pending' };
}

/** After a guardian clicks the link: activate the child's account and send the confirming email ("email plus"). */
export async function afterGuardianVerified(userId: string): Promise<void> {
  const db = serviceClient();
  const g = (await db.from('guardian_consents').select('id, guardian_name, guardian_email').eq('user_id', userId).not('verified_at', 'is', null).is('revoked_at', null)
    .order('verified_at', { ascending: false }).limit(1).maybeSingle()).data;
  if (!g) return;
  await db.from('guardian_consents').update({ guardian_email_verified: true, confirmation_sent_at: new Date().toISOString() }).eq('id', g.id);   // no-op error before the migration
  const ob = (await db.from('onboarding_state').select('completed_at').eq('user_id', userId).maybeSingle()).data;
  if (ob?.completed_at) await db.from('profiles').update({ account_status: 'active', joined_at: new Date().toISOString() }).eq('id', userId).eq('account_status', 'pending');
  await db.from('onboarding_state').update({ step: 'done' }).eq('user_id', userId).eq('step', 'guardian_pending');
  if (g.guardian_email) {
    const e = env();
    await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, [{ to: g.guardian_email, ...templates.guardianConfirmed({ guardian: g.guardian_name, url: `${e.APP_URL}/settings-apps.html#guardian` }) }]);
  }
}
