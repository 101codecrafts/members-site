import { route } from '@/lib/http';
import { handleFlutterwaveWebhook } from '@/services/payments';
export const runtime = 'nodejs';
export const POST = route(async ({ req, log }) => handleFlutterwaveWebhook(await req.text(), req.headers, log));
