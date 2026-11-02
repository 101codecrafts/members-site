import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
const B = z.object({ enabled: z.boolean(), starts_at: z.string().datetime().optional(), ends_at: z.string().datetime().optional(), banner_text: z.string().max(200).optional() });
/** Set / extend the launch promo (ends_at defaults to starts_at + 1 month). Audited via site_settings trigger. */
export const PUT = route(async ({ req }) => {
  const s = await requireAdmin();
  const b = await body(req, B);
  const v = await rpc(s.db, 'admin_set_launch_promo', { p_enabled: b.enabled, p_starts_at: b.starts_at, p_ends_at: b.ends_at, p_banner_text: b.banner_text });
  revalidatePath('/api/v1/settings');
  return v;
});
export const OPTIONS = preflight;
