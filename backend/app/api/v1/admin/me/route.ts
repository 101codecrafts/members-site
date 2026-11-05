import { route, preflight } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { adminMe } from '@/services/admin-console';
/** Console bootstrap: role (root_admin | admin) + scopes. Binds root from the Clerk-verified email. */
export const GET = route(async () => adminMe(await requireAdmin()));
export const OPTIONS = preflight;
