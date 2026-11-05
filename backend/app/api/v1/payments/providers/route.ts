import { route, preflight } from '@/lib/http';
import { listProviders } from '@/services/billing';
/** Secret-free provider list (code, name, status, methods, enabled, mode=sandbox). */
export const GET = route(async () => listProviders(), { cacheSeconds: 60 });
export const OPTIONS = preflight;
