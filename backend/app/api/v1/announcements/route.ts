import { route, preflight, unwrap } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
/** Announcements visible to the caller (targeting by role/level/group/course enforced by RLS), with read flags. */
export const GET = route(async () => {
  const { db, session } = await optionalSession();
  const rows = unwrap(await db.from('announcements').select('id, title, body, link, is_pinned, published_at, expires_at').not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString()).order('is_pinned', { ascending: false }).order('published_at', { ascending: false }).limit(50));
  if (!session) return rows;
  const reads = new Set(((await db.from('announcement_reads').select('announcement_id')).data ?? []).map((r) => r.announcement_id));
  return rows.map((r) => ({ ...r, read: reads.has(r.id) }));
});
export const OPTIONS = preflight;
