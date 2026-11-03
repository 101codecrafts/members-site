import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { ensureProfile } from '@/services/identity';
const Patch = z.object({
  display_name: z.string().min(1).max(80).optional(), username: z.string().regex(/^[a-z0-9_]{3,30}$/).optional(),
  headline: z.string().max(140).nullable().optional(), bio: z.string().max(2000).nullable().optional(), location: z.string().max(80).nullable().optional(),
  skills: z.array(z.string().max(40)).max(30).optional(), github_username: z.string().regex(/^[A-Za-z0-9-]{1,39}$/).nullable().optional(),
  linkedin_url: z.string().url().startsWith('https://').nullable().optional(), website_url: z.string().url().nullable().optional(),
  is_public: z.boolean().optional(), email_opt_in: z.boolean().optional(),
  education_level: z.enum(['primary', 'o_level', 'a_level', 'university', 'professional']).optional(), institution: z.string().max(160).nullable().optional(),
  class_year: z.string().max(40).nullable().optional(),
}).strict();
export const GET = route(async () => {
  const s = await requireUser();
  await ensureProfile(s.userId);
  await rpc(s.db, 'touch_last_seen');
  const [profile, onboarding, unread, plan] = await Promise.all([
    s.db.from('profiles').select('*').eq('id', s.userId).single(),
    s.db.from('onboarding_state').select('*').eq('user_id', s.userId).maybeSingle(),
    s.db.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    rpc(s.db, 'my_plan'),
  ]);
  const pl = plan as { plan: 'free' | 'pro'; ad_tier: 'none' | 'child_directed' | 'standard'; pro_until: string | null };
  const p = unwrap(profile);
  return { profile: { ...p, search_tsv: undefined }, roles: s.roles, role: s.role, account_status: s.accountStatus, tutor_verified: s.tutorVerified,
    mfa_enabled: s.mfaEnabled, plan: pl.plan, pro_until: pl.pro_until, ad_tier: pl.ad_tier, onboarding: onboarding.data, unread_notifications: unread.count ?? 0 };
});
export const PATCH = route(async ({ req }) => {
  const s = await requireUser();
  const input = await body(req, Patch);
  return unwrap(await s.db.from('profiles').update(input).eq('id', s.userId).select('id, username, display_name, headline, bio, skills, is_public').single());
});
export const OPTIONS = preflight;
