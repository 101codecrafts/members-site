# Round 11 · Plans, access and payments: research

Written 5 Nov 2026 (EAT) for the 101 Codecrafts members site. Prices are as published by each vendor on the pages cited. Several vendors show different prices by region and run promotions, so treat USD numbers as benchmarks, not quotes.

## 1. Tiered plans: what the market charges

| Product | Free tier | Paid | What paying unlocks | Source |
|---|---|---|---|---|
| **Coursera Plus** | Free **preview of the first module** of most courses, graded items in it included. This replaced "audit" in Aug 2025 | $59/mo or $399/yr (promo $239/yr to 30 Nov 2026) | 90%+ of catalogue plus unlimited certificates | coursera.org/courseraplus; blog.coursera.org/introducing-courseras-new-course-preview-experience; coursera.support/s/article/learner-000002293 |
| **Udemy** | Instructors mark free-preview lectures; some courses are free | Pay per course, or Personal Plan from $13/mo (annual) | Curated library (28k of 250k courses) | udemy.com/pricing; onlinecourseing.com/udemy-personal-plan |
| **Skillshare** | A few free classes, then a 7-day trial | $13.99/mo billed annually ($167.88) | Unlimited classes, offline, no ads | skillshare.com/en/pricing |
| **LinkedIn Learning** | None (one-month trial) | $39.99/mo or $239.88/yr (via Premium); Teams $379.88 per seat per year | Whole catalogue plus certificates | active-learning-site.com/linkedin-learning-review; trainingcost.com/linkedin-learning-pricing |
| **Cisco NetAcad** | **Self-paced courses are free** | Instructor-led courses need a class code from a partner institution | Instructor, cohort, labs | cisco.com/.../netacad; netacad.com/courses/all-courses |
| **Brilliant** | **2 "keys" a day** (2 concepts), sequential only, ads | $27.99/mo or $161.88/yr (some pages say $24.99 / $150) | No daily limit, skip ahead, AI tutor | brilliant.org/help/pricing-and-plans/...; nibble-app.com/blog/is-brilliant-free |
| **Duolingo Super** | **Every lesson free**, limited by Energy/Hearts and ads | $12.99/mo or $95.99/yr; Family $119.99/yr (6 seats) | Unlimited energy, no ads, practice extras | duolingo.com/super; ca.pcmag.com/language-learning/6481/duolingo |

**Tutor side (commission models):**
| Platform | Model | Source |
|---|---|---|
| Preply | 100% of each new student's trial lesson, then 33% falling to 18% as lifetime hours grow (0–20 h 33%, 21–50 28%, 51–200 25%, 201–400 22%, 400+ 18%) | help.preply.com/en/articles/4171383; plainchalk.com/compare/preply-vs-italki |
| italki | Trial 0%, single lesson 21%, packages 19/17/15%, group class 30% | support.italki.com/hc/en-us/articles/206352068 |
| Udemy (instructors) | 97% when the sale comes through the instructor's own coupon or link; 37% on organic marketplace sales | support.udemy.com/hc/en-us/articles/229605008 |
| Teachable (creator SaaS) | Starter $29/mo (annual) with **7.5% fee, 5 products, ~100 students**; Builder $69 with 0%, 10 products, 1,000 students; Growth $139 with 50 products | teachable.com/pricing; teachable.com/blog/how-to-choose-an-online-course-platform |
| Thinkific | Basic $40, Start $82, Grow $164 per month (annual); 0% platform fee; unlimited courses | thinkific.com/pricing; support.thinkific.com/.../41582716364567 |
| Gumroad (digital goods) | 10% + $0.50 on direct sales, 30% via its Discover marketplace; 7-day payout hold; $100 minimum payout | gumroad.com/pricing; gumroad.com/help/article/13-getting-paid |

**What this means for 101:**
- Two levers recur everywhere: **usage caps** (Teachable products and students, Brilliant keys a day) and **commission that falls as you pay more or teach more** (Preply hours, Teachable's 7.5% → 0%). For a Ugandan tutor, a falling commission matters more than a monthly fee, so the Tutor plans trade a bigger monthly price for a lower commission.
- The learner free tier should feel like Coursera's preview or Duolingo's free tier: real learning that never dead-ends, with clear locks. The founder's "1 course, some lessons locked" sits between Coursera (first module open) and Brilliant (2 a day).

## 2. Freemium gating patterns
1. **Preview the first N lessons or module** (Coursera, Udemy free-preview lectures). Locked items stay *visible* (title, length) with a lock icon and an upgrade CTA. That's the strongest conversion pattern, and it keeps the syllabus honest.
2. **Daily quota** (Brilliant's 2 keys, Duolingo's energy). Good for practice and AI features, bad for long video courses.
3. **Course-count cap** (Teachable's 5 products; our Learner Free = 1 active 101 course). Pair it with "finish or drop a course to free the slot".
4. **Feature gates** (certificates, offline, 1:1s, marketplace selling, analytics).
5. **Free stays free**: Cisco NetAcad self-paced, freeCodeCamp and Coursera previews link out. The founder rule "external courses free for everyone, including guests" matches this. We never gate a free external link behind a plan.

Rules we adopt: locks are explained ("Lesson 4 is part of Standard"), never hidden; the upgrade CTA names the cheapest plan that unlocks the item; the server is the authority (RLS on `lessons`), and the client lock is cosmetic.

## 3. Marketplace seller rules (benchmarks)
- **Only sell what you made or have rights to.** Gumroad bans reselling PLR/MRR e-books, resold courses, templates and software keys; there's a prohibited list (IPTV, AI-service resale, etc.). Source: gumroad.com/help/article/155, gumroad.com/prohibited.
- **Payout hold before release** (Gumroad 7 days; our backend already escrows marketplace funds until delivery is confirmed or `marketplace.escrow_days` = 7, docs/BACKEND.md).
- **Review before listing**: the founder requires admin approval for every listing. The backend already has a `content_status` pending state and store KYC (`app.store_verified`) for mkt_products.
- **Who can sell**: learners and tutors only (guests buy only; visitors neither).

## 4. Ratings integrity
- **FTC Consumer Reviews and Testimonials Rule (16 CFR 465, in force 21 Oct 2024)**: bans reviews that misrepresent that the reviewer *used or had experience with* the product, bans buying reviews conditioned on sentiment, and bans review suppression. ecfr.gov/current/title-16/.../part-465; ftc.gov press release 14 Aug 2024. It's a US rule, but it's the clearest global standard, and Uganda's Competition and Consumer Protection rules point the same way.
- **Udemy**: only enrolled students can rate; first prompt after 12–15 min of video; a reliability filter; instructors may not ask for a particular rating. teach.udemy.com/course-reviews-101; support.udemy.com/.../360007512653.
- **Our rule**: `rating.create` = enrolled (active/completed) for courses, a delivered/confirmed order for marketplace products, an attended booking for sessions. Enforced by DB trigger + RLS, never only in UI. One rating per user per item, editable; ratings never deleted for being negative (anti-suppression), only hidden for abuse by admin with an audit row.

## 5. Uganda payments
| Option | What it is | Integration | Sandbox | Fees (UG) | Source |
|---|---|---|---|---|---|
| **Flutterwave** (current backend) | Aggregator: MTN + Airtel MoMo (`mobile_money_uganda`, network MTN/AIRTEL), local and international cards; hosted checkout; payment plans; transfers | v3 REST (already in `backend/lib/flutterwave.ts`); v4 sandbox at developersandbox-api.flutterwave.com | Test keys `FLWSECK_TEST-…`; mock MoMo with any number + OTP `123456`; test cards; collections are not settled in test mode | MoMo 3%, local cards 3.2% (help centre) / 4.8% (pricing page), international 4.8%; MoMo payout UGX 1,000 below UGX 125k, else 1.2% | developer.flutterwave.com/docs/uganda; /docs/testing; flutterwave.com/ug/pricing; flutterwave.com/ug/support/.../are-there-any-limitations-in-test-mode |
| **MTN MoMo Open API** (direct) | Collections `requesttopay`, disbursements, remittances | OAuth token + `X-Reference-Id` UUID + `Ocp-Apim-Subscription-Key`; `X-Target-Environment: sandbox` / `mtnuganda`. The sandbox uses currency EUR | sandbox.momodeveloper.mtn.com, self-provisioned API user and key | Negotiated with MTN; go-live takes KYC (~10 days per MTN) | mtn.co.ug/helppersonal/mtn-open-api; momodeveloper.mtn.com; momodevelopercommunity.mtn.com/how-to-59/...-455 |
| **Airtel Money Open API** (direct) | Collections (USSD push), disbursements | OAuth client-credentials, `/merchant/v1/payments/` | openapiuat.airtel.africa | Negotiated | developers.airtel.africa; docs.sandpay.dev/en/operators/airtel |
| **Pesapal** (alternate) | East-African aggregator: cards + MoMo | API 3.0 JSON: RequestToken → RegisterIPN → SubmitOrderRequest → GetTransactionStatus | cybqa.pesapal.com/pesapalv3 with separate test consumer key/secret | Per contract | developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/* |
| **DPO Pay** (Network International; alternate) | Pan-African gateway: cards, MoMo, bank | XML API v6 `createToken` → redirect → `verifyToken`; `ChargeTokenMobile` | **Same URL for test and live** (secure.3gdirectpay.com/API/v6/); the **company token** picks the environment, so the adapter must allow-list test tokens explicitly | Per contract | docs.dpopay.com/.../sandbox-test-credentials; /create-token |
| **"Payway"** | Most likely **PayWay Uganda** (African Vending Systems Ltd, since 2009): wallet, bill pay, agents, and a merchant gateway with an API (payments by MoMo + cards, status query, reconciliation). Licensed PSP/PSO under the National Payment Systems Act 2020. Its online-payments product is marked "SOON" on its site | API docs are not public (support.payway.ug KB describes the flow only) | Unknown; ask PayWay | Unknown | payway.ug; payway.ug/products/merchant-services; support.payway.ug/.../payway-application-programming-interface-api; payway.ug/company/news/payway-virtual-card-now-live |

Other meanings of "Payway" (ABA PayWay in Cambodia, Westpac PayWay in Australia) don't operate in Uganda, so they're unlikely. **We need to ask the founder.** If he means PayWay Uganda, the adapter slot is ready (`payway`, status `planned`), and we need its merchant API docs and test credentials.

**Decision:** keep Flutterwave as the default adapter for MTN, Airtel and cards (it's already wired, webhook-verified and ledger-posted). Add a provider interface so Pesapal, DPO, direct MTN/Airtel and PayWay can be switched on by admin later. All adapters run **sandbox only** this round. The server refuses any key that isn't a test key, and refuses to run with `PAYMENTS_MODE` ≠ `sandbox`.

## 6. Guardrails we carry over
- **SR-17:** the database computes every amount (`create_checkout`, `mkt_checkout`, new `create_plan_checkout`). The client sends plan code, interval, method and phone, **never an amount**.
- **SR-16:** fulfilment happens only from the verified webhook / `verify` call, never the browser redirect.
- The ledger is double-entry, balanced by trigger and immutable (`20261102000700_commerce_ledger.sql`). New providers post through the same `apply_payment_internal`.
