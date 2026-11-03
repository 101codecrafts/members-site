import { route } from '@/lib/http';
import { assertCron } from '@/lib/cron';
export const runtime = 'nodejs';
export const maxDuration = 60;
import { ingestNews } from '@/services/news';
export const GET = route(async ({ req, log }) => { assertCron(req); return ingestNews(req.nextUrl.searchParams.get('light') === '1', log); });
