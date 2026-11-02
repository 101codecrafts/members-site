import { route } from '@/lib/http';
import { assertCron } from '@/lib/cron';
export const runtime = 'nodejs';
export const maxDuration = 60;
import { eventReminders } from '@/services/jobs';
export const GET = route(async ({ req, log }) => { assertCron(req); return eventReminders(log); });
