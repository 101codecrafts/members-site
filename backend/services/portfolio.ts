import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';

/**
 * Public portfolio /u/{username}. Uses the service client but returns ONLY
 * public fields, and only for active, public, ADULT profiles (minors are
 * never exposed publicly).
 */
export async function publicPortfolio(username: string) {
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return null;
  const db = serviceClient();
  const p = (await db.from('profiles').select('id, username, display_name, avatar_url, headline, bio, location, skills, github_username, website_url, linkedin_url, education_level, joined_at')
    .eq('username', username).eq('account_status', 'active').eq('is_public', true).eq('is_minor', false).is('deleted_at', null).maybeSingle()).data;
  if (!p) return null;
  const [projects, badges, certs, stats, launches, tutor] = await Promise.all([
    db.from('projects').select('id, slug, title, summary, repo_url, demo_url, cover_url, tech_stack, stars_count').eq('owner_id', p.id).eq('visibility', 'public').is('deleted_at', null).is('hidden_at', null).order('stars_count', { ascending: false }).limit(20),
    db.from('user_badges').select('awarded_at, badges(code, name, icon_url)').eq('user_id', p.id),
    db.from('certificates').select('verify_code, title, issued_at').eq('user_id', p.id).is('revoked_at', null).order('issued_at', { ascending: false }),
    db.from('user_stats').select('xp_total, level, longest_streak').eq('user_id', p.id).maybeSingle(),
    db.from('launch_products').select('slug, name, tagline, logo_url, upvotes_count').eq('owner_id', p.id).eq('status', 'published').is('hidden_at', null),
    db.from('tutor_profiles').select('expertise, levels_taught, rating_avg, rating_count, learners_count').eq('user_id', p.id).eq('verification_status', 'verified').maybeSingle(),
  ]);
  const { id: _id, ...publicProfile } = p;
  return { profile: publicProfile, projects: projects.data ?? [], badges: badges.data ?? [], certificates: (certs.data ?? []).map((c) => ({ ...c, verify_url: `/verify/${c.verify_code}` })),
    stats: stats.data, launches: launches.data ?? [], tutor: tutor.data };
}
