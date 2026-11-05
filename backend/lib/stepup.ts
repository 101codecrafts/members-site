import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { AppError } from '@/lib/errors';

/** Clerk reverification policy for destructive account actions: the first factor (password, email code or Google)
 *  must have been verified within the last 10 minutes. https://clerk.com/docs/guides/secure/reverification */
export const ERASE_REVERIFICATION = { level: 'first_factor', afterMinutes: 10 } as const;

/** Step-up check for sensitive routes. Fails CLOSED: no session, or a Clerk error, is treated as "not recently verified". */
export async function requireRecentVerification(cfg: { level: 'first_factor' | 'second_factor' | 'multi_factor'; afterMinutes: number } = ERASE_REVERIFICATION): Promise<void> {
  let ok = false;
  try {
    const a = await auth();
    ok = Boolean(a.userId) && a.has({ reverification: cfg });
  } catch { ok = false; }
  if (!ok) throw new AppError('reverification_required', 'Sign in again (within the last 10 minutes) to confirm it is you', { reverification: cfg });
}
