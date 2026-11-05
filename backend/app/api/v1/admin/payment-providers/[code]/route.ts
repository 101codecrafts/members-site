import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { providerSwitchBody } from '@/lib/plans-validation';
import { setProvider } from '@/services/billing';
import { getAdapter } from '@/lib/payments/index.ts';
/** ROOT admin switches a provider on/off or reorders it. Stubs and slots can never be enabled (DB check). */
export const PUT = route<{ code: string }>(async ({ req, params }) => {
  const s = await requireAdmin({ superAdmin: true });
  getAdapter(params.code);                       // 4xx-ish early for unknown codes
  const b = await body(req, providerSwitchBody);
  return setProvider(s, params.code, b.enabled, b.sort);
});
export const OPTIONS = preflight;
