# members-site
The 101 Codecrafts members website - built in the open.

## Ads (Google AdSense) and the launch promo
All ad logic lives in `js/ads.js` (styles at the end of `css/app.css`). Nothing ad-related loads yet:
- **Launch promo** — `LAUNCH_PROMO = { enabled: true, endsAt: "TODO-launch+1month" }`. While it is active the AdSense script never loads and a slim, dismissible "Launch month: everything on 101 is free — no ads" bar shows (with a countdown once `endsAt` is a real ISO date such as `2027-01-31T23:59:00+03:00`).
- **Before ads can run, replace the placeholders:** `ADSENSE_CLIENT = "ca-pub-TODO"` and every `SLOTS` id in `js/ads.js`, and the `pub-TODO` in **`/ads.txt`** (`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`). While the client id contains `TODO`, no ads render in production.
- **Tiers:** 101 Pro/premium = no ads; visitors = max 2 units on public content pages (landing, news, library, courses → Free Courses Worldwide, launchpad); free signed-in members = in-feed every ~6 items, banners, a dashboard sidebar ad, a banner under (never over) the course video and one between lessons, plus Google Auto ads anchor + vignette; under-18 members = child-directed, non-personalized, never anchor/vignette.
- **Never:** checkout/payments, sign-in/up, onboarding, admin, tutor tools, testing forms, legal, 404/offline, Lite/data-saver, `?static=1`, or before the cookie notice's "Accept all".
- **AdSense dashboard:** Auto ads ON with only *Anchor* and *Vignette* formats (In-page OFF).
- **Preview locally:** `courses.html?adpreview=1&as=free` (also `anon`, `minor`, `pro`) shows dashed placeholder slots without any network call.
- **CSP** for the AdSense hosts is in `vercel.json`.
