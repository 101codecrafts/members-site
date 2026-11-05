import 'server-only';
import type { Db } from '@/lib/supabase/user';
import { unwrap, unwrapMaybe } from '@/lib/http';
import { withOrganiserFlag } from '@/lib/event-organiser';

/** Read models for public/member catalogue pages. RLS decides visibility. */
export interface Page { limit: number; offset: number }

export const catalogRepo = {
  courses: async (db: Db, p: Page & { level?: string; q?: string; featured?: boolean }) => {
    let q = db.from('courses').select('id, slug, title, summary, level, levels, cover_url, is_free, price_ugx, duration_minutes, tags, rating_avg, rating_count, enrollments_count, tutor_id, is_featured, published_at')
      .eq('status', 'published').is('deleted_at', null).order('is_featured', { ascending: false }).order('published_at', { ascending: false })
      .range(p.offset, p.offset + p.limit - 1);
    if (p.level) q = q.contains('levels', [p.level]);
    if (p.featured) q = q.eq('is_featured', true);
    return unwrap(await q);
  },
  course: async (db: Db, slug: string) => {
    const course = unwrapMaybe(await db.from('courses').select('*').eq('slug', slug).maybeSingle());
    if (!course) return null;
    const lessons = unwrap(await db.from('lessons').select('id, position, title, duration_minutes, is_preview').eq('course_id', course.id).order('position'));
    const media = unwrap(await db.from('course_media').select('id, lesson_id, kind, provider_id, title, channel, author, duration_seconds, thumbnail_url, source_url, embeddable, position').eq('course_id', course.id).order('position'));
    return { ...course, search_tsv: undefined, lessons, media };
  },
  tools: async (db: Db, featuredOnly: boolean) => {
    let q = db.from('tools').select('id, slug, name, category, description, website_url, logo_url, pricing, student_offer, tags, is_featured, featured_rank').eq('status', 'published');
    if (featuredOnly) q = q.eq('is_featured', true);
    return unwrap(await q.order('featured_rank', { ascending: true, nullsFirst: false }).limit(100));
  },
  resources: async (db: Db, p: Page & { type?: string; level?: string; path?: string }) => {
    let q = db.from('external_resources').select('id, type, title, description, image_url, site_name, favicon_url, author, provider, price_text, is_free, duration_text, rating, rating_count, tags, levels, learning_path_id, is_featured, link_status, click_count, published_at')
      .eq('status', 'published').neq('link_status', 'dead').order('is_featured', { ascending: false }).order('published_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
    if (p.type) q = q.eq('type', p.type);
    if (p.level) q = q.contains('levels', [p.level]);
    if (p.path) q = q.eq('learning_path_id', p.path);
    return unwrap(await q);
  },
  news: async (db: Db, p: Page & { category?: string }) => {
    let q = db.from('news_items').select('id, source, title, summary, ai_summary, image_url, author, category, score, published_at, is_featured')
      .eq('status', 'published').order('is_featured', { ascending: false }).order('published_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
    if (p.category) q = q.eq('category', p.category);
    return unwrap(await q);
  },
  /** `me` = the signed-in user id (or null). Each row gets `organiser: true` when `me` created the event; the creator's id itself is never returned. */
  events: async (db: Db, p: Page & { level?: string }, me: string | null = null) => {
    let q = db.from('events').select('id, slug, title, description, starts_at, ends_at, timezone, location, is_online, cal_com_url, cover_url, capacity, price_ugx, registrations_count, levels, is_featured, group_id, created_by')
      .eq('status', 'published').gte('starts_at', new Date().toISOString()).order('starts_at').range(p.offset, p.offset + p.limit - 1);
    if (p.level) q = q.contains('levels', [p.level]);
    return withOrganiserFlag(unwrap(await q), me);
  },
  launches: async (db: Db, p: Page & { sort: 'top' | 'new'; day?: string }) => {
    let q = db.from('launch_products').select('id, slug, name, tagline, logo_url, demo_url, repo_url, stack_tags, stage, level, upvotes_count, comments_count, followers_count, launched_on, owner_id').eq('status', 'published').is('hidden_at', null);
    if (p.day) q = q.eq('launched_on', p.day);
    q = p.sort === 'top' ? q.order('upvotes_count', { ascending: false }) : q.order('launched_on', { ascending: false });
    return unwrap(await q.range(p.offset, p.offset + p.limit - 1));
  },
  socialLinks: async (db: Db) => unwrap(await db.from('social_links').select('id, platform, url, label, display_order').eq('is_active', true).order('display_order')),
  publicSettings: async (db: Db) => unwrap(await db.from('site_settings').select('key, value').eq('is_public', true)),
  flags: async (db: Db) => unwrap(await db.from('feature_flags').select('key, enabled, rollout_pct, allowed_roles')),
};
