import { route } from '@/lib/http';
import { handleClerkWebhook } from '@/services/identity';
export const runtime = 'nodejs';
export const POST = route(async ({ req, log }) => handleClerkWebhook(await req.text(), req.headers, log));
