import { route, preflight, unwrap } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
/** Shipping zones (Kampala boda, pickup, courier, digital) + pickup points. */
export const GET = route(async () => {
  const db = anonClient();
  const [zones, points] = await Promise.all([db.from('mkt_shipping_zones').select('id, store_id, name, method, fee_ugx, eta_days, areas'), db.from('mkt_pickup_points').select('id, name, address, lat, lng, hours')]);
  return { zones: unwrap(zones), pickup_points: unwrap(points) };
}, { cacheSeconds: 600 });
export const OPTIONS = preflight;
