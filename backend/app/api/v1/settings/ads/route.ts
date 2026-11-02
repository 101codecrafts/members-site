import { NextResponse } from 'next/server';
import { route, preflight } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
import { getSession } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';

interface AdsConfig { enabled: boolean; adsense_client: string | null; slots: Record<string, string | null>; placements: Record<string, boolean>; never_on: string[] }
type AdTier = 'none' | 'child_directed' | 'standard';

/** Hard floor: an admin setting can never turn ads on here. */
const NEVER = ['checkout', 'payments', 'payouts', 'wallet', 'admin', 'verify', 'guardian', 'onboarding'];

/**
 * Ads config.
 *  - anonymous → cached base config, ad_tier 'standard'
 *  - signed in → private verdict from the plan: Pro = 'none' (ad-free),
 *    under-18 on free = 'child_directed' (client MUST request
 *    non-personalised ads with tag_for_child_directed_treatment=1 /
 *    tag_for_under_age_of_consent=1), adults on free = 'standard'.
 */
export const GET = route(async ({ req }) => {
  const row = (await anonClient().from('site_settings').select('value').eq('key', 'ads').maybeSingle()).data;
  const cfg = { enabled: false, adsense_client: null, slots: {}, placements: {}, never_on: [], ...((row?.value ?? {}) as Partial<AdsConfig>) } as AdsConfig;
  const configured = cfg.enabled && !!cfg.adsense_client && /^ca-pub-\d{10,20}$/.test(cfg.adsense_client);
  const never = Array.from(new Set([...NEVER, ...(cfg.never_on ?? [])]));
  const base = {
    enabled: configured,
    adsense_client: configured ? cfg.adsense_client : null,
    slots: cfg.slots ?? {},
    placements: Object.fromEntries(Object.entries(cfg.placements ?? {}).filter(([p]) => !never.includes(p))),
    never_on: never,
  };
  const hasAuth = req.headers.has('authorization') || req.cookies.has('__session');
  if (!hasAuth) {
    return NextResponse.json({ data: { ...base, ad_tier: 'standard' as AdTier, personalized: true } },
      { headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=1200' } });
  }
  const s = await getSession();
  const plan = s ? ((await rpc(s.db, 'my_plan')) as { plan: string; ad_tier: AdTier }) : { plan: 'free', ad_tier: 'standard' as AdTier };
  const tier = plan.ad_tier;
  return NextResponse.json({ data: {
    ...base,
    enabled: base.enabled && tier !== 'none',
    plan: plan.plan,
    ad_tier: tier,
    personalized: tier === 'standard',
    child_directed: tier === 'child_directed',
    placements: tier === 'none' ? {} : base.placements,
  } }, { headers: { 'cache-control': 'private, no-store' } });
});
export const OPTIONS = preflight;
