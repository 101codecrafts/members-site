import 'server-only';
import type { NextRequest } from 'next/server';
import { safeEqual } from '@/lib/crypto';
import { AppError } from '@/lib/errors';

/** Vercel Cron (and the GitHub Actions hourly news refresh) send `Authorization: Bearer $CRON_SECRET`. */
export function assertCron(req: NextRequest): void {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization') ?? '';
  if (!secret || !safeEqual(got, `Bearer ${secret}`)) throw new AppError('unauthenticated', 'Invalid cron secret');
}
