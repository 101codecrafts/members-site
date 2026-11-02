import { route, preflight, body, query, unwrap } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
import { catalogRepo } from '@/repositories/catalog';
export const GET = route(async () => {
  const db = anonClient();
  const [settings, flags] = await Promise.all([catalogRepo.publicSettings(db), catalogRepo.flags(db)]);
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value])) as Record<string, unknown>;
  const promo = (map.launch_promo ?? {}) as { enabled?: boolean; starts_at?: string | null; ends_at?: string | null; banner_text?: string; reminders_sent?: unknown };
  const now = Date.now();
  const active = Boolean(promo.enabled && promo.starts_at && promo.ends_at && now >= Date.parse(promo.starts_at) && now < Date.parse(promo.ends_at));
  delete map.launch_promo;
  return { settings: map, flags, launch_promo: { active, starts_at: promo.starts_at ?? null, ends_at: promo.ends_at ?? null,
    banner_text: active ? promo.banner_text ?? null : null, days_left: active && promo.ends_at ? Math.ceil((Date.parse(promo.ends_at) - now) / 864e5) : 0 } };
}, { cacheSeconds: 60 });
export const OPTIONS = preflight;
