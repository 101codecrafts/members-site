import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { announcementBody } from '@/lib/validation';
import { broadcastAnnouncement } from '@/services/admin';
export const POST = route(async ({ req }) => {
  const s = await requireAdmin();
  return broadcastAnnouncement(s, await body(req, announcementBody));
});
export const OPTIONS = preflight;
