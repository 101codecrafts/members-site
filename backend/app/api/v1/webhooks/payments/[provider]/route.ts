import { route } from '@/lib/http';
import { AppError } from '@/lib/errors';
import { handleFlutterwaveWebhook } from '@/services/payments';
/**
 * Generic provider webhook slot: /api/v1/webhooks/payments/{provider}. Flutterwave reuses the verified handler
 * (signature + /verify re-fetch, SR-16). Other providers are stubs this round and answer 501 until enabled,
 * so nothing un-verified can ever reach apply_provider_payment.
 */
export const POST = route<{ provider: string }>(async ({ req, params, log }) => {
  if (params.provider === 'flutterwave') return handleFlutterwaveWebhook(await req.text(), req.headers, log);
  throw new AppError('upstream_error', `Webhooks for ${params.provider} are not enabled in this build`);
});
