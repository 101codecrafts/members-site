import { route, preflight } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
import { signDownloads } from '@/services/marketplace';
/** Signed, expiring download URLs for a purchased digital item (buyer only, capped count). */
export const POST = route<{ itemId: string }>(async ({ params }) => {
  const s = await requireUser();
  const g = (await rpc(s.db, 'mkt_download', { p_item: uuid.parse(params.itemId) })) as unknown as { files: Array<{ path: string; filename: string }>; license_key: string | null; ttl_seconds: number };
  const files = await signDownloads(g.files, g.ttl_seconds);
  return { files, license_key: g.license_key, expires_in: g.ttl_seconds };
}, { rateLimit: { name: 'download', max: 20, windowSeconds: 600 } });
export const OPTIONS = preflight;
