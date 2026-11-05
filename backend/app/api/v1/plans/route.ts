import { route, preflight } from '@/lib/http';
import { getCatalogue } from '@/services/billing';
/** Public plan catalogue: admin-edited UGX prices + limits, enabled providers/methods. Sandbox mode only. */
export const GET = route(async () => getCatalogue(), { cacheSeconds: 60 });
export const OPTIONS = preflight;
