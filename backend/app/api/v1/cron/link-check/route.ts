import { route } from '@/lib/http';
import { assertCron } from '@/lib/cron';
export const runtime = 'nodejs';
export const maxDuration = 60;
import { checkLinks } from '@/services/resources';
export const GET = route(async ({ req, log }) => { assertCron(req); return checkLinks(200, log); });
