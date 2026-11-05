# 101 Codecrafts plans: proposal for the founder (round 11)

**Every price and limit below is admin-editable data, never code.** The defaults ship in `src/data/plans.json` (front end, used as the offline fallback) and in the seed of migration `20261105001100_plans_access.sql` (`plan_tiers` + `subscription_plans`). The admin console edits them through `PUT /api/v1/admin/plans/{audience}/{tier}`.

> **UGX prices are SUGGESTIONS for the founder to confirm.** They're set so Standard costs about what a learner spends on data for a week, and so they sit far below the USD benchmarks in RESEARCH.md (Skillshare $13.99, Coursera $59, Duolingo $12.99 a month). Annual = 10 × monthly (two months free), which matches the 20–40% annual discounts the benchmarks use.

Rank order: `free < standard < plus < pro`. "∞" means `null` in the data (no cap). Admins and root admin are never plan-limited.

## Founder anchors (fixed)
- **Tutor Free = max 2 students.**
- **Learner Free = 1 active 101 course, with some lessons locked** (default: the first 3 lessons plus any lesson the tutor marks "preview" are open; the rest need Standard).
- External courses (Coursera, freeCodeCamp, NetAcad, etc.) are **free for everyone, including guests**, and are never counted against a plan.

## Learner plans
| | **Free** | **Standard** | **Plus** | **Pro** |
|---|---|---|---|---|
| Suggested price (UGX / month) | 0 | **15,000** | **35,000** | **75,000** |
| Suggested price (UGX / year) | 0 | 150,000 | 350,000 | 750,000 |
| Active 101 courses at once (`courses.active`) | **1** | 3 | 10 | ∞ |
| Lessons open in each free-plan course (`lessons.free_per_course`) | **3** + previews | all | all | all |
| External courses | ∞ | ∞ | ∞ | ∞ |
| Certificates on 101 courses (`certificates`) | – | ✓ | ✓ | ✓ |
| 101 AI messages per day (`ai.daily`) | 10 | 50 | 200 | 1,000 (fair use) |
| Paid 1:1 sessions with tutors (`session.book`) | pay per session | pay per session | 10% off | 1 × 30 min included / month, 15% off the rest |
| Projects (`projects.active`) | 2 | 5 | 20 | ∞ |
| Marketplace: buy | ✓ | ✓ | ✓ | ✓ |
| Marketplace: sell (admin approves each listing) | 3 listings, 15% fee | 10 listings, 12% | 25 listings, 10% | 100 listings, 8% |
| Offline downloads (`offline`) | – | – | ✓ | ✓ |
| Ads | yes (child-directed only for under-18s) | none | none | none |
| Support | community | email | priority | priority + career review |

Paid courses a learner buys outright are fully unlocked whatever the plan (they paid for that course). The plan only adds the course-count cap and the lesson locks on **free** 101 courses.

## Tutor plans
| | **Free** | **Standard** | **Plus** | **Pro** |
|---|---|---|---|---|
| Suggested price (UGX / month) | 0 | **25,000** | **60,000** | **120,000** |
| Suggested price (UGX / year) | 0 | 250,000 | 600,000 | 1,200,000 |
| Students across all courses and 1:1s (`students.max`) | **2** | 25 | 150 | ∞ |
| Published courses (`courses.published`) | 1 | 3 | 10 | ∞ |
| 1:1 / group sessions per month (`sessions.per_month`) | 4 | 20 | 60 | ∞ |
| 101 commission on course + session sales (`commission.pct`) | 30% | 20% | 15% | 10% |
| Course price range a tutor may *request* (admin approves) | UGX 1,000–50,000 | 1,000–150,000 | 1,000–300,000 | 1,000–500,000 |
| Coupons (`coupons`) | – | ✓ | ✓ | ✓ |
| Learner analytics | basic | basic | full | full + export |
| Marketplace sell | 3 listings, 15% | 10, 12% | 25, 10% | 100, 8% |
| Featured placement (`featured.monthly`) | – | – | 1 / month | 3 / month |
| Payout minimum (`payout.min_ugx`) | 50,000 | 20,000 | 10,000 | 10,000 |

The commission falls as the plan rises (the Preply/Teachable pattern in RESEARCH.md). At 30% on Free, 101 earns more than Udemy's 37% organic share only through volume. A tutor earning about UGX 250k/month saves more on Standard (20%) than the plan costs.

## Visitor and guest rights (no plan)
| Action key | visitor (signed out) | guest (email + code only) | learner | tutor | admin / root |
|---|---|---|---|---|---|
| Marketing pages, news (`news.read`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| External courses (`course.view_external`) | → /auth | ✓ | ✓ | ✓ | ✓ |
| Admin-marked free 101 courses (`course.enroll_free`) | → /auth | ✓ (Free-plan locks apply) | ✓ | ✓ | ✓ |
| 101 tutor / paid courses (`course.enroll`) | → /auth | → "become a learner" | ✓ (plan cap) | ✓ | ✓ |
| Locked lessons (`lesson.view_locked`) | → /auth | → "become a learner" | Standard+ | Standard+ | ✓ |
| Marketplace buy (`market.buy`) | → /auth | ✓ | ✓ | ✓ | ✓ |
| Marketplace sell (`market.sell`) | → /auth | → "become a learner or tutor" | ✓ (approval) | ✓ (approval) | ✓ |
| Rate a course / book / resource / product (`rating.create`) | → /auth | ✗ | ✓ if enrolled / bought / attended | same | moderate only |
| Book a 1:1 (`session.book`) | → /auth | ✗ | ✓ | ✓ | ✓ |
| Set a course price (`course.price_request`) | – | – | – | ✓ → admin queue | ✓ direct |
| Approve price / make course free or paid (`course.price_approve`) | – | – | – | – | ✓ |
| Upgrade plan (`plan.upgrade`) | → /auth | → "become a learner or tutor" | ✓ | ✓ | – |
| Edit plans and prices (`plan.manage`) | – | – | – | – | ✓ |
| Switch payment providers (`payment.provider_manage`) | – | – | – | – | root only |

## Upgrade and downgrade rules (proposed)
- An upgrade takes effect when the payment is verified by webhook (SR-16). The old subscription for the same audience is cancelled automatically, and the new period starts then. **No proration this round** (open question for the founder).
- A downgrade or cancel takes effect at the end of the paid period (`cancel_at_period_end`).
- Over the cap after a downgrade: nothing is deleted. Extra courses become read-only, and new enrolments are blocked until under the cap.
- A Tutor over `students.max` keeps existing students. New enrolments in that tutor's courses are refused with a clear "this tutor is full" message.

## Open questions for the founder
1. Are the suggested UGX prices right, and should annual be 10× (2 months free)?
2. Free-plan lessons: is "first 3 lessons + previews" right, or should tutors pick the free lessons per course?
3. Proration on upgrade: none (proposed), or a credit for unused days?
4. "Payway": PayWay Uganda (African Vending Systems)? If yes, we need its merchant API docs and test credentials.
5. Should Standard remove ads (proposed), or only Plus and up?
6. Tutor commission on marketplace items: use the seller fee row (proposed), or the tutor commission?
