import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { settingBody, flagBody } from '@/lib/validation';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
export const GET = route(async () => {
  const s = await requireAdmin();
  const [settings, flags] = await Promise.all([s.db.from('site_settings').select('*'), s.db.from('feature_flags').select('*')]);
  return { settings: unwrap(settings), flags: unwrap(flags) };
});
export const PUT = route(async ({ req }) => {
  const s = await requireAdmin();
  const b = await body(req, z.union([z.object({ setting: settingBody }), z.object({ flag: flagBody })]));
  if ('setting' in b) await rpc(s.db, 'admin_set_setting', { p_key: b.setting.key, p_value: b.setting.value as never, p_is_public: b.setting.is_public });
  else await rpc(s.db, 'admin_set_flag', { p_key: b.flag.key, p_enabled: b.flag.enabled, p_rollout_pct: b.flag.rollout_pct, p_roles: b.flag.roles });
  revalidatePath('/api/v1/settings');
  return { ok: true };
});
export const OPTIONS = preflight;
