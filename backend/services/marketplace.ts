import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';

/** Signs purchased digital files from the private bucket with a short TTL (authorisation already done by mkt_download). */
export async function signDownloads(files: Array<{ path: string; filename: string }>, ttlSeconds: number) {
  const storage = serviceClient().storage.from('marketplace-private');
  return Promise.all(files.map(async (f) => ({
    filename: f.filename,
    url: (await storage.createSignedUrl(f.path, Math.min(Math.max(ttlSeconds, 30), 900), { download: f.filename })).data?.signedUrl ?? null,
  })));
}
