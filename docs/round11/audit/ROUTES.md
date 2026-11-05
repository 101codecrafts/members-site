# ROUTES.md: route and click map (round 11 audit)

Live site audited 5 Nov 2026 (EAT) at main **f33b32b** (static domain `members-site-staging.vercel.app`, backend 3f36f1a on the protected alias).
"Now" = what the element does today: its href, or the effect of clicking it (`opens/changes UI`, `NO-OP` = nothing happened, `dialog:` = browser alert, `nav:` = JS navigation, `popup:` = new tab).
**visitor** = public static domain, no session. **signed-in** = protected alias as the QA Learner (Clerk dev user, account_status=pending, roles=[]). Columns merge 412 and 1440 px.
**Tutor / admin / root "now" = the signed-in column.** f33b32b has no role-based routing at all: every page renders the same markup for every signed-in user; the only role-aware bit is the account-menu "Switch role" tabs, shown when GET /v1/me returns more than one role (js/auth.js `roles()`). Verified by code read, not by a live tutor/admin/root account (none exist besides the founder's).
"Should" applies the founder rules in BRIEF.md (qa/policy.py). `auth` = the join flow with a return-to. Guest home does not exist yet.

## Role homes (should)

| role | lands on after sign-in (should) | lands on today |
|---|---|---|
| visitor | /index.html | index.html (signed out) |
| guest | guest home (new) | dashboard.html (Clerk signInForceRedirectUrl, same for every role) · sign-up → onboarding.html → dashboard.html or tutor.html by the button picked |
| learner | /dashboard.html | dashboard.html (Clerk signInForceRedirectUrl, same for every role) · sign-up → onboarding.html → dashboard.html or tutor.html by the button picked |
| tutor | /tutor.html | dashboard.html (Clerk signInForceRedirectUrl, same for every role) · sign-up → onboarding.html → dashboard.html or tutor.html by the button picked |
| admin | /admin.html | dashboard.html (Clerk signInForceRedirectUrl, same for every role) · sign-up → onboarding.html → dashboard.html or tutor.html by the button picked |
| root | /admin.html | dashboard.html (Clerk signInForceRedirectUrl, same for every role) · sign-up → onboarding.html → dashboard.html or tutor.html by the button picked |

## Page access: today vs should

| page | today, visitor | today, signed-in | visitor | guest | learner | tutor | admin | root |
|---|---|---|---|---|---|---|---|---|
| 404.html | 200 | not crawled | ok | ok | ok | ok | ok | ok |
| about.html | 200 | not crawled | ok | ok | ok | ok | ok | ok |
| admin.html | 200, app shell+sidebar, demo data | not crawled | auth | deny | deny | deny | ok | ok |
| ai-tools.html | 200, app shell+sidebar | not crawled | auth | ok* | ok | ok | ok | ok |
| announcements.html | 200, app shell+sidebar | not crawled | auth | ok | ok | ok | ok | ok |
| article.html | 200, app shell+sidebar, demo data | not crawled | ok | ok | ok | ok | ok | ok |
| card.html | 200, app shell+sidebar | not crawled | auth | ok | ok | ok | ok | ok |
| cards.html | 200, demo data | not crawled | ok | ok | ok | ok | ok | ok |
| cart.html | 200, app shell+sidebar | not crawled | auth | ok | ok | ok | ok | ok |
| checkout.html | 200, app shell+sidebar, demo data | not crawled | auth | ok | ok | ok | ok | ok |
| community.html | 200 | not crawled | ok | ok | ok | ok | ok | ok |
| competitions.html | 200, app shell+sidebar, demo data | not crawled | auth | ok* | ok | ok | ok | ok |
| contest.html | 200, app shell+sidebar, demo data | not crawled | auth | ok* | ok | ok | ok | ok |
| contests.html | 200, app shell+sidebar, demo data | not crawled | auth | ok* | ok | ok | ok | ok |
| course.html | 200, app shell+sidebar | not crawled | auth | ok if free/external, else up | ok (paywall/plan lock) | ok | ok | ok |
| course.html?id=web-basics | not crawled | not crawled | auth | ok if free/external, else up | ok (paywall/plan lock) | ok | ok | ok |
| courses.html | 200, app shell+sidebar, demo data | not crawled | auth | ok (external + free only) | ok | ok | ok | ok |
| dashboard.html | 200, app shell+sidebar, demo data | not crawled | auth | home | ok | home | home | home |
| events.html | 200, app shell+sidebar, demo data | not crawled | ok | ok | ok | ok | ok | ok |
| go.html | 200 | not crawled | ok (news) / auth (courses, resources) | ok | ok | ok | ok | ok |
| groups.html | 200, app shell+sidebar | not crawled | auth | ok* | ok | ok | ok | ok |
| ide.html | 200, app shell+sidebar | not crawled | auth | ok* | ok | ok | ok | ok |
| index.html | 200, demo data | not crawled | ok | ok | ok | ok | ok | ok |
| interview.html | 200, app shell+sidebar | not crawled | auth | ok* | ok | ok | ok | ok |
| launchpad.html | 200, app shell+sidebar | not crawled | auth | ok (browse; no posting) | ok | ok | ok | ok |
| learn.html | 200, app shell+sidebar | not crawled | auth | ok* | ok | ok | ok | ok |
| marketplace.html | 200, app shell+sidebar, demo data | not crawled | auth | ok (buy only) | ok | ok | ok | ok |
| news.html | 200, app shell+sidebar | not crawled | ok | ok | ok | ok | ok | ok |
| nope-404-probe.html | not crawled | not crawled | ok | ok | ok | ok | ok | ok |
| offline.html | 200 | not crawled | ok | ok | ok | ok | ok | ok |
| onboarding.html | 200 | not crawled | auth | ok until complete, then home | ok until complete, then home | ok until complete, then home | home | home |
| opportunities.html | 200, app shell+sidebar | not crawled | ok | ok | ok | ok | ok | ok |
| orders.html | 200, app shell+sidebar, demo data | not crawled | auth | ok | ok | ok | ok | ok |
| practice.html | 200, app shell+sidebar | not crawled | auth | ok* | ok | ok | ok | ok |
| privacy.html | 200 | not crawled | ok | ok | ok | ok | ok | ok |
| problem.html | 200, app shell+sidebar | not crawled | auth | ok* | ok | ok | ok | ok |
| product-item.html | 200, app shell+sidebar, demo data | not crawled | auth | ok (buy only) | ok | ok | ok | ok |
| product.html | 200, app shell+sidebar, demo data | not crawled | auth | ok (buy only) | ok | ok | ok | ok |
| profile.html | 200, app shell+sidebar | not crawled | auth (own) / ok (public /u/handle) | ok | ok | ok | ok | ok |
| projects.html | 200, app shell+sidebar | not crawled | auth | up | ok | ok | ok | ok |
| resources.html | 200, app shell+sidebar | not crawled | auth | ok (browse) | ok | ok | ok | ok |
| rfq.html | 200, app shell+sidebar, demo data | not crawled | auth | ok (buyer side) | ok | ok | ok | ok |
| seller.html | 200, app shell+sidebar, demo data | not crawled | auth | up | ok | ok | ok | ok |
| session.html | 200, app shell+sidebar | not crawled | auth | up | ok | ok | ok | ok |
| sessions.html | not crawled | not crawled | auth | up | ok | ok | ok | ok |
| settings-apps.html | not crawled | not crawled | auth | ok | ok | ok | ok | ok |
| signin.html | not crawled | not crawled | → /auth | home | home | home | home | home |
| signup.html | not crawled | not crawled | → /auth?mode=signup | home | home | home | home | home |
| terms.html | not crawled | not crawled | ok | ok | ok | ok | ok | ok |
| testing.html | not crawled | not crawled | auth | ok (browse; no campaigns) | ok | ok | ok | ok |
| tutor.html | not crawled | not crawled | auth | up | deny (offer "become a tutor") | ok | home | home |
| verify.html | not crawled | not crawled | ok | ok | ok | ok | ok | ok |
| whiteboard.html | not crawled | not crawled | auth | up | ok | ok | ok | ok |

## Global shell (sidebar, top bar, account menu, footer): elements on 4+ pages

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| top | Codecrafts | index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  | <!-- 4 pages -->
| top | Join | signup.html | — | **visitor**: /auth?mode=signup; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: hidden; **root**: hidden |  | <!-- 36 pages -->
| footer | Home | index.html | — | all roles: /index.html |  | <!-- 35 pages -->
| footer | About | about.html | — | all roles: about.html |  | <!-- 34 pages -->
| footer | Community | community.html | — | all roles: community.html |  | <!-- 34 pages -->
| footer | Learn | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  | <!-- 35 pages -->
| footer | AI Tools | ai-tools.html | — | **visitor**: /auth?next=ai-tools.html; **guest**: ai-tools.html (ok*); **learner**: ai-tools.html; **tutor**: ai-tools.html; **admin**: ai-tools.html; **root**: ai-tools.html |  | <!-- 33 pages -->
| footer | News | news.html | — | all roles: news.html |  | <!-- 33 pages -->
| footer | Opportunities | opportunities.html | — | all roles: opportunities.html |  | <!-- 33 pages -->
| footer | Events | events.html | — | all roles: events.html |  | <!-- 33 pages -->
| footer | Privacy | privacy.html | — | all roles: privacy.html |  | <!-- 33 pages -->
| footer | Terms | terms.html | — | all roles: terms.html |  | <!-- 33 pages -->
| footer | Verify a certificate | verify.html | — | all roles: verify.html |  | <!-- 33 pages -->
| footer | Join the 101 Codecrafts WhatsApp community | https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh | — | all roles: external (new tab, rel=noopener) |  | <!-- 35 pages -->
| footer | 101 Codecrafts on GitHub | https://github.com/101codecrafts | — | all roles: /index.html |  | <!-- 36 pages -->
| footer | 101 Codecrafts team account on GitHub (101codecr | https://github.com/101codecrafts-ug | — | all roles: /index.html |  | <!-- 35 pages -->
| sidebar | 101 Codecrafts Build. Learn. Grow. 101 Codecraft | index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  | <!-- 16 pages -->
| sidebar | Collapse sidebar | opens/changes UI | — | all roles: same as now |  | <!-- 17 pages -->
| sidebar | Projects | projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  | <!-- 16 pages -->
| sidebar | Marketplace | marketplace.html | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  | <!-- 16 pages -->
| sidebar | WhatsApp community | https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh | — | all roles: external (new tab, rel=noopener) |  | <!-- 17 pages -->
| top | News | news.html | — | all roles: news.html |  | <!-- 32 pages -->
| top | Opportunities | opportunities.html | — | all roles: opportunities.html |  | <!-- 32 pages -->
| top | Events | events.html | — | all roles: events.html |  | <!-- 32 pages -->
| top | Notifications | opens/changes UI | — | all roles: same as now |  | <!-- 6 pages -->
| top | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  | <!-- 33 pages -->
| top | Sign in | signin.html | — | **visitor**: /auth; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: hidden; **root**: hidden |  | <!-- 32 pages -->
| sidebar | Expand sidebar | opens/changes UI | — | all roles: same as now |  | <!-- 16 pages -->
| sidebar |  | dashboard.html | — | **visitor**: /auth?next=dashboard.html; **guest**: guest home (new); **learner**: dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  | <!-- 15 pages -->
| sidebar |  | profile.html | — | **visitor**: profile.html (auth (own) / ok (public /u/handle)); **guest**: profile.html; **learner**: profile.html; **tutor**: profile.html; **admin**: profile.html; **root**: profile.html |  | <!-- 15 pages -->
| sidebar |  | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  | <!-- 15 pages -->
| sidebar |  | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  | <!-- 16 pages -->
| sidebar |  | learn.html | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  | <!-- 16 pages -->
| sidebar |  | practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  | <!-- 16 pages -->
| sidebar |  | ai-tools.html | — | **visitor**: /auth?next=ai-tools.html; **guest**: ai-tools.html (ok*); **learner**: ai-tools.html; **tutor**: ai-tools.html; **admin**: ai-tools.html; **root**: ai-tools.html |  | <!-- 16 pages -->
| sidebar |  | projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  | <!-- 15 pages -->
| sidebar |  | launchpad.html | — | **visitor**: /auth?next=launchpad.html; **guest**: launchpad.html (ok (browse; no posting)); **learner**: launchpad.html; **tutor**: launchpad.html; **admin**: launchpad.html; **root**: launchpad.html |  | <!-- 15 pages -->
| sidebar |  | testing.html | — | **visitor**: /auth?next=testing.html; **guest**: testing.html (ok (browse; no campaigns)); **learner**: testing.html; **tutor**: testing.html; **admin**: testing.html; **root**: testing.html |  | <!-- 15 pages -->
| sidebar |  | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  | <!-- 15 pages -->
| sidebar |  | groups.html | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  | <!-- 15 pages -->
| sidebar |  | events.html | — | all roles: events.html |  | <!-- 16 pages -->
| sidebar |  | marketplace.html | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  | <!-- 16 pages -->
| sidebar |  | news.html | — | all roles: news.html |  | <!-- 16 pages -->
| sidebar |  | opportunities.html | — | all roles: opportunities.html |  | <!-- 16 pages -->
| sidebar |  | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  | <!-- 16 pages -->
| sidebar |  | courses.html#c101 | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  | <!-- 15 pages -->
| sidebar |  | card.html | — | **visitor**: /auth?next=card.html; **guest**: card.html; **learner**: card.html; **tutor**: card.html; **admin**: card.html; **root**: card.html |  | <!-- 16 pages -->
| sidebar |  | settings-apps.html | — | **visitor**: /auth?next=settings-apps.html; **guest**: settings-apps.html; **learner**: settings-apps.html; **tutor**: settings-apps.html; **admin**: settings-apps.html; **root**: settings-apps.html |  | <!-- 16 pages -->
| sidebar |  | https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh | — | all roles: external (new tab, rel=noopener) |  | <!-- 16 pages -->
| top | 101 Codecrafts home | index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  | <!-- 16 pages -->
| top | Notifications | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  | <!-- 26 pages -->
| sidebar | Home | dashboard.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  | <!-- 15 pages -->
| sidebar | Community | profile.html | — | all roles: community.html |  | <!-- 15 pages -->
| sidebar | Notifications | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  | <!-- 15 pages -->
| sidebar | Learning | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  | <!-- 15 pages -->
| sidebar | Learn | learn.html | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  | <!-- 15 pages -->
| sidebar | Practice | practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  | <!-- 15 pages -->
| sidebar | AI Tools | ai-tools.html | — | **visitor**: /auth?next=ai-tools.html; **guest**: ai-tools.html (ok*); **learner**: ai-tools.html; **tutor**: ai-tools.html; **admin**: ai-tools.html; **root**: ai-tools.html |  | <!-- 15 pages -->
| sidebar | Launchpad | launchpad.html | — | **visitor**: /auth?next=launchpad.html; **guest**: launchpad.html (ok (browse; no posting)); **learner**: launchpad.html; **tutor**: launchpad.html; **admin**: launchpad.html; **root**: launchpad.html |  | <!-- 15 pages -->
| sidebar | Testing | testing.html | — | **visitor**: /auth?next=testing.html; **guest**: testing.html (ok (browse; no campaigns)); **learner**: testing.html; **tutor**: testing.html; **admin**: testing.html; **root**: testing.html |  | <!-- 15 pages -->
| sidebar | Competitions | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  | <!-- 15 pages -->
| sidebar | Groups | groups.html | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  | <!-- 15 pages -->
| sidebar | Events & Meetups | events.html | — | all roles: events.html |  | <!-- 15 pages -->
| sidebar | Daily News | news.html | — | all roles: news.html |  | <!-- 15 pages -->
| sidebar | Opportunities | opportunities.html | — | all roles: opportunities.html |  | <!-- 15 pages -->
| sidebar | Announcements | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  | <!-- 15 pages -->
| sidebar | Library | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  | <!-- 15 pages -->
| sidebar | My Courses | courses.html#c101 | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  | <!-- 15 pages -->
| sidebar | My Projects | projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  | <!-- 15 pages -->
| sidebar | My Downloads | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  | <!-- 15 pages -->
| sidebar | My Profile | profile.html | — | **visitor**: profile.html (auth (own) / ok (public /u/handle)); **guest**: profile.html; **learner**: profile.html; **tutor**: profile.html; **admin**: profile.html; **root**: profile.html |  | <!-- 15 pages -->
| sidebar | Member card | card.html | — | **visitor**: /auth?next=card.html; **guest**: card.html; **learner**: card.html; **tutor**: card.html; **admin**: card.html; **root**: card.html |  | <!-- 15 pages -->
| sidebar | Settings | settings-apps.html | — | **visitor**: /auth?next=settings-apps.html; **guest**: settings-apps.html; **learner**: settings-apps.html; **tutor**: settings-apps.html; **admin**: settings-apps.html; **root**: settings-apps.html |  | <!-- 15 pages -->

## Per page (page-specific elements)

### 404.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Home | /index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | Dashboard | /dashboard.html | — | **visitor**: /auth?next=dashboard.html; **guest**: guest home (new); **learner**: dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | Courses | /courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Library | /resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | Practice | /practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | AI Tools | /ai-tools.html | — | **visitor**: /auth?next=ai-tools.html; **guest**: ai-tools.html (ok*); **learner**: ai-tools.html; **tutor**: ai-tools.html; **admin**: ai-tools.html; **root**: ai-tools.html |  |
| main | Back to home | /index.html | — | all roles: index.html |  |
| main | Browse the Library | /resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |
| top | 101 Codecrafts | /index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| top | Learn | /courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| top | Library | /resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| top | Sign in | /signin.html | — | **visitor**: /auth; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: hidden; **root**: hidden |  |
| footer | Privacy | /privacy.html | — | all roles: privacy.html |  |
| footer | Terms | /terms.html | — | all roles: terms.html |  |

### about.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Join 101 free | signup.html | — | **visitor**: signup.html (→ /auth?mode=signup); **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | Meet the community | community.html | — | all roles: community.html |  |
| main | EXPERT-LED LEARNING | sessions.html | — | **visitor**: /auth?next=sessions.html; **guest**: upgrade: become a learner or tutor; **learner**: sessions.html; **tutor**: sessions.html; **admin**: sessions.html; **root**: sessions.html |  |
| main | SKILL-BUILDING WORKSHOPS | events.html | — | all roles: events.html |  |
| main | COLLABORATIVE PROJECTS | projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  |
| main | CAREER DEVELOPMENT | opportunities.html | — | all roles: opportunities.html |  |
| main | TECH RESOURCE HUB | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | PEER STUDY GROUPS | groups.html | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | CERTIFICATION SUPPORT | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | @octavious2 on GitHub (opens in a new tab) | https://github.com/octavious2 | — | all roles: external (new tab, rel=noopener) |  |
| main | Privacy policy: children | privacy.html | — | all roles: privacy.html |  |
| main | Community rules | terms.html | — | all roles: terms.html |  |
| main | WhatsApp community Join the community chat (open | https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh | — | all roles: external (new tab, rel=noopener) |  |
| main | GitHub @101codecrafts (opens in a new tab) | https://github.com/101codecrafts | — | all roles: external (new tab, rel=noopener) |  |
| main | GitHub (team account) @101codecrafts-ug (opens i | https://github.com/101codecrafts-ug | — | all roles: external (new tab, rel=noopener) |  |
| main | privacy@101codecrafts.org | mailto:privacy@101codecrafts.org | — | all roles: mailto:privacy@101codecrafts.org |  |
| main | privacy policy | privacy.html | — | all roles: privacy.html |  |
| main | Is 101 Codecrafts free? | opens/changes UI | — | all roles: same as now |  |
| main | Where is 101 based? | opens/changes UI | — | all roles: same as now |  |
| main |  | events.html | — | all roles: events.html |  |
| main | Who can join? | opens/changes UI | — | all roles: same as now |  |
| main |  | signup.html | — | **visitor**: signup.html (→ /auth?mode=signup); **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | How do I become a tutor? | opens/changes UI | — | all roles: same as now |  |
| main | I’m under 18. Can I join? | opens/changes UI | — | all roles: same as now |  |
| main |  | privacy.html | — | all roles: privacy.html |  |
| main | How do I get a certificate? | opens/changes UI | — | all roles: same as now |  |
| main |  | verify.html | — | all roles: verify.html |  |
| main |  | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Join the WhatsApp community (opens in a new tab) | https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh | — | all roles: external (new tab, rel=noopener) |  |
| main | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### admin.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Open | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| main | All announcements | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| main | Hide pinned announcement | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Add Course | opens/changes UI | — | **visitor**: hidden; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: admin console action; **root**: admin console action |  |
| main | Create Event | opens/changes UI | — | **visitor**: hidden; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: admin console action; **root**: admin console action |  |
| main | Post Announcement | opens/changes UI | — | **visitor**: hidden; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: admin console action; **root**: admin console action |  |
| main | Invite Admin | opens/changes UI | — | **visitor**: hidden; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: hidden; **root**: root only: add admin by email |  |
| main | Export CSV | opens/changes UI | — | all roles: same as now |  |
| main | Approve | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | Reject | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | All | opens/changes UI | — | all roles: same as now |  |
| main | Learners | opens/changes UI | — | all roles: same as now |  |
| main | Tutors | opens/changes UI | — | all roles: same as now |  |
| main | Admins | opens/changes UI | — | all roles: same as now |  |
| main | CSV | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | learner tutor admin | not clicked | — | all roles: same as now |  |
| main | Suspend | gone<br>skipped(cap) | — | all roles: same as now |  |
| main | Verify tutor | gone | — | all roles: same as now |  |
| main | Unsuspend | gone | — | all roles: same as now |  |
| main | Hold | skipped(cap) | — | all roles: same as now |  |
| main | Test Flutterwave checkout | skipped(cap) | — | **visitor**: /auth?next=…; **guest**: ok; **learner**: ok; **tutor**: ok; **admin**: ok; **root**: ok |  |
| main | Refund | skipped(cap) | — | all roles: same as now |  |
| main | Remove | skipped(cap) | — | all roles: same as now |  |
| main | Keep | skipped(cap) | — | all roles: same as now |  |
| main | + New event | skipped(cap) | — | all roles: same as now |  |
| main | Cal.com | skipped(cap) | — | all roles: index.html |  |
| main | Open Library → | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | Fetch preview | skipped(cap) | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | Save | skipped(cap) | — | all roles: same as now |  |
| main | View all → | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| main | Publish announcement | skipped(cap) | — | all roles: same as now |  |
| main | Open Opportunities → | opportunities.html | — | all roles: opportunities.html |  |
| main | Reorder YouTube (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Reorder Instagram (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Reorder TikTok (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Reorder X (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Reorder LinkedIn (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Reorder Discord (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Reorder Facebook (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Reorder WhatsApp Channel / Group (use arrow keys | skipped(cap) | — | all roles: same as now |  |
| main | Reorder Telegram (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Reorder GitHub (use arrow keys) | skipped(cap) | — | all roles: same as now |  |
| main | Open 101 AI assistant | skipped(cap) | — | all roles: same as now |  |
| sidebar | Overview | admin.html | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Analytics | admin.html#analytics | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Members | admin.html#users | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Learners | admin.html#users | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Tutors | admin.html#users | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Approvals | admin.html#approvals | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Courses & Paths | admin.html#courses | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Tools/Software | ai-tools.html | — | **visitor**: /auth?next=ai-tools.html; **guest**: ai-tools.html (ok*); **learner**: ai-tools.html; **tutor**: ai-tools.html; **admin**: ai-tools.html; **root**: ai-tools.html |  |
| sidebar | Library | admin.html#add-resource | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Announcements | admin.html#announcements | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Opportunity review | admin.html#opp-queue | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| sidebar | Events | admin.html#events | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Payments & Payouts | admin.html#payments | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Reports | admin.html#moderation | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Audit Log | admin.html#audit | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |
| sidebar | Settings | admin.html#settings | — | **visitor**: /auth?next=admin.html; **guest**: hidden; direct hit → guest home (new); **learner**: hidden; direct hit → /dashboard.html; **tutor**: hidden; direct hit → /tutor.html; **admin**: admin.html; **root**: admin.html |  |

### ai-tools.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Try it with your key | #playground (in-page) | — | all roles: index.html |  |
| main | All categories | opens/changes UI | — | all roles: same as now |  |
| main | LLM APIs | opens/changes UI | — | all roles: same as now |  |
| main | Coding assistants | opens/changes UI | — | all roles: same as now |  |
| main | Image/Video | opens/changes UI | — | all roles: same as now |  |
| main | Speech | opens/changes UI | — | all roles: same as now |  |
| main | Hosting/GPUs | opens/changes UI | — | all roles: same as now |  |
| main | Datasets | opens/changes UI | — | all roles: same as now |  |
| main | Get a free API key from Hugging Face (opens in a | /go/ai-huggingface | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Hugging Face docs (opens in a new tab) | /go/ai-huggingface-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | How to get your key | gone | — | all roles: same as now |  |
| main | Get a free API key from OpenRouter (opens in a n | /go/ai-openrouter | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | OpenRouter docs (opens in a new tab) | /go/ai-openrouter-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Groq (opens in a new tab | /go/ai-groq | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Groq docs (opens in a new tab) | /go/ai-groq-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Google AI Studio (opens  | /go/ai-ai-studio | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Google AI Studio docs (opens in a new tab) | /go/ai-ai-studio-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Mistral (La Plateforme)  | /go/ai-mistral | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Mistral (La Plateforme) docs (opens in a new tab | /go/ai-mistral-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from NVIDIA NIM (opens in a n | /go/ai-nvidia-nim | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | NVIDIA NIM docs (opens in a new tab) | /go/ai-nvidia-nim-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Cerebras (opens in a new | /go/ai-cerebras | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Cerebras docs (opens in a new tab) | /go/ai-cerebras-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Cloudflare Workers AI (o | /go/ai-cf-workers-ai | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Cloudflare Workers AI docs (opens in a new tab) | /go/ai-cf-workers-ai-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from GitHub Copilot (opens in | /go/ai-copilot | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | GitHub Copilot docs (opens in a new tab) | /go/ai-copilot-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from GitHub Models (opens in  | /go/ai-github-models | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | GitHub Models docs (opens in a new tab) | /go/ai-github-models-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Vercel AI Gateway (opens | /go/ai-vercel-ai-gateway | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Vercel AI Gateway docs (opens in a new tab) | /go/ai-vercel-ai-gateway-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Kaggle (opens in a new t | /go/ai-kaggle | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Kaggle docs (opens in a new tab) | /go/ai-kaggle-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Google Colab (opens in a | /go/ai-colab | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Google Colab docs (opens in a new tab) | /go/ai-colab-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Get a free API key from Sunbird AI (opens in a n | /go/ai-sunbird | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Sunbird AI docs (opens in a new tab) | /go/ai-sunbird-docs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | OpenRouter Groq Hugging Face | not clicked | — | all roles: same as now |  |
| main | Send one prompt | opens/changes UI | — | all roles: same as now |  |
| main | Forget my key | opens/changes UI | — | all roles: same as now |  |
| main | Get a free key ↗ | /go/ai-openrouter | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### announcements.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Open | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| main | All announcements | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| main | Hide pinned announcement | NO-OP | — | all roles: same as now | 🔴 dead |
| main | All | opens/changes UI | — | all roles: same as now |  |
| main | Everyone | opens/changes UI | — | all roles: same as now |  |
| main | Learners | opens/changes UI | — | all roles: same as now |  |
| main | Tutors | opens/changes UI | — | all roles: same as now |  |
| main | Admins | opens/changes UI | — | all roles: same as now |  |
| main | Open | opportunities.html | — | all roles: opportunities.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### article.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Learn | learn.html | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  |
| main | DSA | learn.html?topic=dsa | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  |
| main | Two Pointer Technique | article.html?slug=two-pointer-technique | — | all roles: article.html |  |
| main | Binary Search: Iterative and Recursive | article.html?slug=binary-search | — | all roles: article.html |  |
| main | Kadane's Algorithm — Maximum Subarray Sum | article.html?slug=kadanes-algorithm | — | all roles: article.html |  |
| main | BFS vs DFS on Graphs | article.html?slug=bfs-dfs-graphs | — | all roles: article.html |  |
| main | Reverse a Linked List | article.html?slug=linked-list-reverse | — | all roles: article.html |  |
| main | C++ | opens/changes UI | — | all roles: same as now |  |
| main | Python | opens/changes UI | — | all roles: same as now |  |
| main | Java | opens/changes UI | — | all roles: same as now |  |
| main | JavaScript | opens/changes UI | — | all roles: same as now |  |
| main | Copy | opens/changes UI | — | all roles: same as now |  |
| main | Run in IDE | nav:/ide.html?from=two-pointer-technique | — | all roles: same as now |  |
| main | Explain with 101 AI | opens/changes UI | — | all roles: same as now |  |
| main | Pair Sum in Sorted Array | problem.html?id=pair-sum-sorted | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Remove Duplicates | problem.html?id=remove-duplicates | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Container With Most Water | problem.html?id=container-water | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Improve this article | opens/changes UI | — | all roles: same as now |  |
| main | Post comment | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Like 14 | opens/changes UI | — | all roles: same as now |  |
| main | Introduction | #intro (in-page) | — | all roles: index.html |  |
| main | Problem: Pair with given sum | #problem (in-page) | — | all roles: index.html |  |
| main | Naive approach — O(n²) | #naive (in-page) | — | all roles: index.html |  |
| main | Two pointer approach — O(n) | #approach (in-page) | — | all roles: index.html |  |
| main | Complexity | #complexity (in-page) | — | all roles: index.html |  |
| main | Common variations | #variations (in-page) | — | all roles: index.html |  |
| main | Practice problems | #practice (in-page) | — | all roles: index.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### card.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Zoom out | opens/changes UI | — | all roles: same as now |  |
| main | Zoom in | opens/changes UI | — | all roles: same as now |  |
| main | Reset | opens/changes UI | — | all roles: same as now |  |
| main | Download PNG | not clicked | — | all roles: same as now |  |
| main | Share | not clicked | — | all roles: same as now |  |
| main | Copy caption | opens/changes UI | — | all roles: same as now |  |
| main | Start over | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### cards.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Python Foundations: from your first line to a wo | courses.html?path=software-dev | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Skill-building workshops | events.html | — | all roles: events.html |  |
| main | Resource hub | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | Join 101 Codecrafts | signup.html | — | **visitor**: signup.html (→ /auth?mode=signup); **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | Media 1:1 · product | marketplace.html | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Add to cart | opens/changes UI | — | **visitor**: /auth?next=…; **guest**: ok; **learner**: ok; **tutor**: ok; **admin**: ok; **root**: ok |  |
| main | Media 4:3 · story | news.html | — | all roles: news.html |  |
| main | StudyBuddy | launchpad.html | — | **visitor**: /auth?next=launchpad.html; **guest**: launchpad.html (ok (browse; no posting)); **learner**: launchpad.html; **tutor**: launchpad.html; **admin**: launchpad.html; **root**: launchpad.html |  |
| main | ▲ 48 | opens/changes UI | — | all roles: same as now |  |
| main | Boda Route Planner | launchpad.html | — | **visitor**: /auth?next=launchpad.html; **guest**: launchpad.html (ok (browse; no posting)); **learner**: launchpad.html; **tutor**: launchpad.html; **admin**: launchpad.html; **root**: launchpad.html |  |
| main | Register solo | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Register a team | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Rest | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Hover | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Pressed | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Focus | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Selected | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Disabled | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Browse courses | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Try again | opens/changes UI | — | all roles: same as now |  |
| main | Data & AI basics | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | Library | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | Join | signup.html | — | **visitor**: /auth?mode=signup; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: hidden; **root**: hidden |  |
| main | Short | sessions.html | — | **visitor**: /auth?next=sessions.html; **guest**: upgrade: become a learner or tutor; **learner**: sessions.html; **tutor**: sessions.html; **admin**: sessions.html; **root**: sessions.html |  |
| main | A much longer card title that wraps onto a secon | groups.html | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | Medium | projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  |
| main | Scholarships closing this week | opportunities.html | — | all roles: opportunities.html |  |
| main | Meetups this month | events.html | — | all roles: events.html |  |
| main | Today's tech news | news.html | — | all roles: news.html |  |
| main | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### cart.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All categories | opens/changes UI | — | all roles: same as now |  |
| main | Search | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Orders | orders.html | — | **visitor**: /auth?next=orders.html; **guest**: orders.html; **learner**: orders.html; **tutor**: orders.html; **admin**: orders.html; **root**: orders.html |  |
| main | RFQ | rfq.html | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Cart | cart.html | — | **visitor**: /auth?next=cart.html; **guest**: cart.html; **learner**: cart.html; **tutor**: cart.html; **admin**: cart.html; **root**: cart.html |  |
| main | Software & Apps | marketplace.html?cat=software#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Templates & UI kits | marketplace.html?cat=templates#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Courses bundles | marketplace.html?cat=courses#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Laptops & Gadgets | marketplace.html?cat=laptops#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Electronics components/IoT | marketplace.html?cat=iot#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Services (design, dev, tutoring) | marketplace.html?cat=services#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Books | marketplace.html?cat=books#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Browse the marketplace | marketplace.html | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Proceed to checkout | checkout.html | — | **visitor**: /auth?next=…; **guest**: ok; **learner**: ok; **tutor**: ok; **admin**: ok; **root**: ok |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### checkout.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All categories | opens/changes UI | — | all roles: same as now |  |
| main | Search | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Orders | orders.html | — | **visitor**: /auth?next=orders.html; **guest**: orders.html; **learner**: orders.html; **tutor**: orders.html; **admin**: orders.html; **root**: orders.html |  |
| main | RFQ | rfq.html | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Cart | cart.html | — | **visitor**: /auth?next=cart.html; **guest**: cart.html; **learner**: cart.html; **tutor**: cart.html; **admin**: cart.html; **root**: cart.html |  |
| main | Software & Apps | marketplace.html?cat=software#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Templates & UI kits | marketplace.html?cat=templates#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Courses bundles | marketplace.html?cat=courses#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Laptops & Gadgets | marketplace.html?cat=laptops#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Electronics components/IoT | marketplace.html?cat=iot#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Services (design, dev, tutoring) | marketplace.html?cat=services#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Books | marketplace.html?cat=books#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Kampala Wakiso Mukono Entebbe Jinja Mbarara Gulu | not clicked | — | all roles: same as now |  |
| main | Browse the marketplace | marketplace.html | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Place order & pay UGX 5,000 | not clicked | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### community.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Join the WhatsApp community (opens in a new tab) | https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh | — | all roles: external (new tab, rel=noopener) |  |
| main | STUDY GROUPS | groups.html | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | EVENTS & MEETUPS | events.html | — | all roles: events.html |  |
| main | HACKATHONS & COMPETITIONS | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| main | MEMBER PROJECTS | projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  |
| main | LAUNCHPAD | launchpad.html | — | **visitor**: /auth?next=launchpad.html; **guest**: launchpad.html (ok (browse; no posting)); **learner**: launchpad.html; **tutor**: launchpad.html; **admin**: launchpad.html; **root**: launchpad.html |  |
| main | BETA TESTING | testing.html | — | **visitor**: /auth?next=testing.html; **guest**: testing.html (ok (browse; no campaigns)); **learner**: testing.html; **tutor**: testing.html; **admin**: testing.html; **root**: testing.html |  |
| main | tech news | news.html | — | all roles: news.html |  |
| main | opportunities | opportunities.html | — | all roles: opportunities.html |  |
| main | announcements | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| main | WhatsApp community | https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh | — | all roles: external (new tab, rel=noopener) |  |
| main | github.com/101codecrafts | https://github.com/101codecrafts | — | all roles: external (new tab, rel=noopener) |  |
| main | terms | terms.html | — | all roles: terms.html |  |
| main | about page | about.html | — | all roles: about.html |  |
| main | Join the community | signup.html | — | **visitor**: /auth?mode=signup; **guest**: community.html; **learner**: community.html; **tutor**: community.html; **admin**: community.html; **root**: community.html |  |
| main | About 101 Codecrafts | about.html | — | all roles: about.html |  |
| main | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### competitions.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All levels | opens/changes UI | — | all roles: same as now |  |
| main | Primary | opens/changes UI | — | all roles: same as now |  |
| main | O-Level | opens/changes UI | — | all roles: same as now |  |
| main | A-Level | opens/changes UI | — | all roles: same as now |  |
| main | University | opens/changes UI | — | all roles: same as now |  |
| main | Professional | opens/changes UI | — | all roles: same as now |  |
| main | All tracks Open innovation Cybersecurity AI & ML | not clicked | — | all roles: same as now |  |
| main | Register solo | gone | — | all roles: same as now |  |
| main | Register a team | gone | — | all roles: same as now |  |
| main | Submit | gone | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### contest.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Contests | contests.html | — | **visitor**: /auth?next=contests.html; **guest**: contests.html (ok*); **learner**: contests.html; **tutor**: contests.html; **admin**: contests.html; **root**: contests.html |  |
| main | Boda Fare Splitter | problem.html?id=pair-sum-sorted&contest=weekly-48 | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Matatu Queue | problem.html?id=pair-sum-sorted&contest=weekly-48 | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Rolex Stand Profits | problem.html?id=pair-sum-sorted&contest=weekly-48 | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Lake Victoria Islands | problem.html?id=pair-sum-sorted&contest=weekly-48 | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Refresh | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### contests.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Learn | learn.html | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  |
| main | Practice | practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Online IDE | ide.html | — | **visitor**: /auth?next=ide.html; **guest**: ide.html (ok*); **learner**: ide.html; **tutor**: ide.html; **admin**: ide.html; **root**: ide.html |  |
| main | Contests | contests.html | — | **visitor**: /auth?next=contests.html; **guest**: contests.html (ok*); **learner**: contests.html; **tutor**: contests.html; **admin**: contests.html; **root**: contests.html |  |
| main | Interview prep | interview.html | — | **visitor**: /auth?next=interview.html; **guest**: interview.html (ok*); **learner**: interview.html; **tutor**: interview.html; **admin**: interview.html; **root**: interview.html |  |
| main | Enter contest | contest.html?id=weekly-48 | — | **visitor**: /auth?next=contest.html; **guest**: contest.html (ok*); **learner**: contest.html; **tutor**: contest.html; **admin**: contest.html; **root**: contest.html |  |
| main | Leaderboard | contest.html?id=weekly-48#lb | — | **visitor**: /auth?next=contest.html; **guest**: contest.html (ok*); **learner**: contest.html; **tutor**: contest.html; **admin**: contest.html; **root**: contest.html |  |
| main | Register | opens/changes UI | — | all roles: same as now |  |
| main | Results & editorials | contest.html?id=hacktober-ug<br>contest.html?id=weekly-47 | — | **visitor**: /auth?next=contest.html; **guest**: contest.html (ok*); **learner**: contest.html; **tutor**: contest.html; **admin**: contest.html; **root**: contest.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### course.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | How the web works | ?lesson=l1 | — | all roles: index.html |  |
| main | HTML crash course | ?lesson=l2 | — | all roles: index.html |  |
| main | 3 CSS: zero to hero | ?lesson=l3 | — | all roles: index.html |  |
| main | 4 JavaScript in 100 seconds | ?lesson=l4 | — | all roles: index.html |  |
| main | 5 Git & GitHub for beginners | ?lesson=l5 | — | all roles: index.html |  |
| main | 6 Deploy your site | ?lesson=l6 | — | all roles: index.html |  |
| main | Play video: CSS: zero to hero | opens/changes UI | — | all roles: same as now |  |
| main | Mark complete | opens/changes UI | — | all roles: same as now |  |
| main | Next lesson | nav:/course.html?lesson=l4 | — | all roles: same as now |  |
| main | Overview | opens/changes UI | — | all roles: same as now |  |
| main | Notes | opens/changes UI | — | all roles: same as now |  |
| main | Books & Resources | opens/changes UI | — | all roles: same as now |  |
| main | Discussion | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### courses.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | 101 Courses | #c101 (in-page) | — | all roles: index.html |  |
| main | Free Courses Worldwide | #cfree (in-page) | — | all roles: index.html |  |
| main | All categories Web Development Data & AI Cyberse | not clicked | — | all roles: same as now |  |
| main | All providers 101 Codecrafts Coursera edX freeCo | not clicked | — | all roles: same as now |  |
| main | Any access Free Free audit Free trial Free until | not clicked | — | all roles: same as now |  |
| main | All levels | opens/changes UI | — | all roles: same as now |  |
| main | Primary | opens/changes UI | — | all roles: same as now |  |
| main | O-Level | opens/changes UI | — | all roles: same as now |  |
| main | A-Level | opens/changes UI | — | all roles: same as now |  |
| main | University | opens/changes UI | — | all roles: same as now |  |
| main | Professional | opens/changes UI | — | all roles: same as now |  |
| main | Web Development Basics | course.html?id=web-basics | — | **visitor**: /auth?next=course.html; **guest**: course.html (ok if free/external, else up); **learner**: course.html (ok (paywall/plan lock)); **tutor**: course.html; **admin**: course.html; **root**: course.html |  |
| main | Log Analysis with Python | course.html?id=log-python | — | **visitor**: /auth?next=course.html; **guest**: course.html (ok if free/external, else up); **learner**: course.html (ok (paywall/plan lock)); **tutor**: course.html; **admin**: course.html; **root**: course.html |  |
| main | Git & GitHub for Teams | course.html?id=git-teams | — | **visitor**: /auth?next=course.html; **guest**: course.html (ok if free/external, else up); **learner**: course.html (ok (paywall/plan lock)); **tutor**: course.html; **admin**: course.html; **root**: course.html |  |
| main | Ethical Hacking Foundations | course.html?id=ethical-hacking-101 | — | **visitor**: /auth?next=course.html; **guest**: course.html (ok if free/external, else up); **learner**: course.html (ok (paywall/plan lock)); **tutor**: course.html; **admin**: course.html; **root**: course.html |  |
| main | Coding with Scratch for Kids | course.html?id=scratch-kids | — | **visitor**: /auth?next=course.html; **guest**: course.html (ok if free/external, else up); **learner**: course.html (ok (paywall/plan lock)); **tutor**: course.html; **admin**: course.html; **root**: course.html |  |
| main | O-Level ICT: Networks & the Internet | course.html?id=ict-olevel | — | **visitor**: /auth?next=course.html; **guest**: course.html (ok if free/external, else up); **learner**: course.html (ok (paywall/plan lock)); **tutor**: course.html; **admin**: course.html; **root**: course.html |  |
| main | Data Analysis with Ugandan Open Data | course.html?id=data-uganda | — | **visitor**: /auth?next=course.html; **guest**: course.html (ok if free/external, else up); **learner**: course.html (ok (paywall/plan lock)); **tutor**: course.html; **admin**: course.html; **root**: course.html |  |
| main | Google AI Essentials on Coursera (opens in a new | /go/x-coursera-aiess | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Microsoft Learn: Azure & cloud training on Micro | /go/x-ms-training | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Introduction to Cybersecurity on Cisco NetAcad ( | /go/x-cisco-cyber | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Responsive Web Design Certification on freeCodeC | /go/x-fcc-rwd | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | JavaScript, Python & more: full curriculum on fr | /go/x-fcc-learn | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Machine Learning (Andrew Ng) on Coursera (opens  | /go/x-coursera-ml | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Learning How to Learn on Coursera (opens in a ne | /go/x-coursera-lhtl | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Google IT Support Professional Certificate on Co | /go/x-coursera-gits | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | CS50: Introduction to Computer Science on edX (o | /go/x-edx-cs50 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Computer Science courses on edX on edX (opens in | /go/x-edx-cs | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Machine Learning Crash Course on Google (opens i | /go/x-google-mlcc | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Grow with Google: digital skills on Google (open | /go/x-google-grow | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Microsoft Learn: browse all modules on Microsoft | /go/x-ms-browse | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Networking Basics on Cisco NetAcad (opens in a n | /go/x-cisco-netbasics | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Computer Programming: JS & ProcessingJS on Khan  | /go/x-khan-prog | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | AP Computer Science Principles on Khan Academy ( | /go/x-khan-apcsp | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Free IT & programming courses on Alison (opens i | /go/x-alison | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Fetch preview | opens/changes UI | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### dashboard.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Open | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| main | All announcements | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| main | Hide pinned announcement | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Join Community | signup.html | — | **visitor**: /auth?mode=signup; **guest**: community.html; **learner**: community.html; **tutor**: community.html; **admin**: community.html; **root**: community.html |  |
| main | CodeCraft IDE | ide.html | — | **visitor**: /auth?next=ide.html; **guest**: ide.html (ok*); **learner**: ide.html; **tutor**: ide.html; **admin**: ide.html; **root**: ide.html |  |
| main | Software Engineering 12 COURSES • BEGINNER | opens/changes UI | — | all roles: same as now | 🔴 no href |
| main | Data Science & Analytics 10 COURSES • BEGINNER | opens/changes UI | — | all roles: same as now | 🔴 no href |
| main | Cybersecurity & Ethical Hacking 8 COURSES • INTE | opens/changes UI | — | all roles: same as now | 🔴 no href |
| main | AI & Machine Learning 12 COURSES • INTERMEDIATE | opens/changes UI | — | all roles: same as now | 🔴 no href |
| main | Cloud & DevOps 10 COURSES • INTERMEDIATE | opens/changes UI | — | all roles: same as now | 🔴 no href |
| main | IT Infrastructure & Networking 8 COURSES • BEGIN | opens/changes UI | — | all roles: same as now | 🔴 no href |
| main | Like 24 | opens/changes UI | — | all roles: same as now |  |
| main | Comments 6 | opens/changes UI | — | all roles: same as now |  |
| main | Share | opens/changes UI | — | all roles: same as now |  |
| main | Explore Groups | groups.html | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | Join Community | opens/changes UI | — | **visitor**: /auth?mode=signup; **guest**: community.html; **learner**: community.html; **tutor**: community.html; **admin**: community.html; **root**: community.html | 🔴 no href |
| main | Create Project | opens/changes UI | — | **visitor**: hidden; **guest**: hidden; **learner**: projects.html#new; **tutor**: projects.html#new; **admin**: hidden; **root**: hidden | 🔴 no href |
| main | Browse Courses | opens/changes UI | — | all roles: same as now | 🔴 no href |
| main | Read Docs | opens/changes UI | — | all roles: same as now | 🔴 no href |
| main | Make your member card | card.html | — | **visitor**: /auth?next=card.html; **guest**: card.html; **learner**: card.html; **tutor**: card.html; **admin**: card.html; **root**: card.html |  |
| main | 101 Codecrafts Build. Learn. Grow | index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | Today in tech | opens/changes UI | — | all roles: same as now |  |
| main | Opportunities | opens/changes UI | — | all roles: same as now |  |
| main | Events | opens/changes UI | — | all roles: same as now |  |
| main | All news | news.html | — | all roles: news.html |  |
| main | Ugandan fintechs push Mobile Money APIs to more  | /go/fn1 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Small open-weight models now run well on mid-ran | /go/fn2 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Node.js and Python both ship security releases t | /go/fn3 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | East African startup funding: seed rounds hold s | /go/fn4 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Kampala innovation hubs open more free evening b | /go/fn5 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open Library | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | Responsive Web Design Certification , Course on  | /go/fcc-rwd | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | CS50: Introduction to Computer Science , Course  | /go/cs50x | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Machine Learning for Everybody – Full Course , V | /go/yt-ml-crash | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Structure and Interpretation of Computer Program | /go/ol-sicp | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |
| top | View All | ai-tools.html | — | **visitor**: /auth?next=ai-tools.html; **guest**: ai-tools.html (ok*); **learner**: ai-tools.html; **tutor**: ai-tools.html; **admin**: ai-tools.html; **root**: ai-tools.html |  |
| top | View All | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| top | View All → | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| top | View All → | events.html | — | all roles: events.html |  |
| footer | Community | index.html#community | — | all roles: community.html |  |
| footer | Resources | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| footer | About | index.html#about | — | all roles: index.html |  |

### events.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Open | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| main | All announcements | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| main | Hide pinned announcement | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Organiser view | #organiser (in-page) | — | all roles: index.html |  |
| main | Submit an event | #submit-event (in-page) | — | all roles: index.html |  |
| main | All | opens/changes UI | — | all roles: same as now |  |
| main | Kampala | opens/changes UI | — | all roles: same as now |  |
| main | Uganda | opens/changes UI | — | all roles: same as now |  |
| main | Africa | opens/changes UI | — | all roles: same as now |  |
| main | Online | opens/changes UI | — | all roles: same as now |  |
| main | Worldwide | opens/changes UI | — | all roles: same as now |  |
| main | All types Hackathon Meetup Conference Workshop W | not clicked | — | all roles: same as now |  |
| main | All organisers 101 Codecrafts Google Developer G | not clicked | — | all roles: same as now |  |
| main | Free & paid Free Paid | not clicked | — | all roles: same as now |  |
| main | Saved | opens/changes UI | — | all roles: same as now |  |
| main | List | opens/changes UI | — | all roles: same as now |  |
| main | Calendar | opens/changes UI | — | all roles: same as now |  |
| main | Map | opens/changes UI | — | all roles: same as now |  |
| main | Save | gone<br>skipped(cap) | — | all roles: same as now |  |
| main | Open Cavendish University Uganda, Nsambya in Goo | https://www.google.com/maps/search/?api=1&query=0.2998%2C32.5835 | — | all roles: external (new tab, rel=noopener) |  |
| main | I'm going | gone<br>skipped(cap) | — | all roles: same as now |  |
| main | RSVP on 101 | gone<br>skipped(cap) | — | all roles: same as now |  |
| main | Add to calendar | gone<br>skipped(cap) | — | all roles: same as now |  |
| main | Remind me | gone<br>skipped(cap) | — | all roles: same as now |  |
| main | RSVP for Microsoft Reactor: Build your first AI  | /go/ev-reactor | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open Outbox Hub, Kampala in Google Maps (new tab | https://www.google.com/maps/search/?api=1&query=0.3349%2C32.5836 | — | all roles: external (new tab, rel=noopener) |  |
| main | Open The Innovation Village, Ntinda in Google Ma | https://www.google.com/maps/search/?api=1&query=0.3536%2C32.6155 | — | all roles: external (new tab, rel=noopener) |  |
| main | RSVP for Kampala JavaScript meetup on the organi | /go/ev-kla-js | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open Makerere University, Kampala in Google Maps | https://www.google.com/maps/search/?api=1&query=0.335%2C32.568 | — | all roles: external (new tab, rel=noopener) |  |
| main | RSVP for Microsoft Learn Student Ambassadors: Az | /go/ev-mlsa | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | RSVP for Alibaba Cloud Academy: Cloud computing  | /go/ev-alibaba | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open Kampala (venue on GDG page) in Google Maps  | https://www.google.com/maps/search/?api=1&query=0.3163%2C32.5822 | — | all roles: external (new tab, rel=noopener) |  |
| main | RSVP for DevFest Kampala on the organiser's site | /go/ev-devfest | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | RSVP for OpenAI developer community meetup (Buil | /go/ev-openai | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | RSVP for Hugging Face open-source AI sprint: Afr | /go/ev-hf | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open Gulu (GDG Gulu) in Google Maps (new tab) | https://www.google.com/maps/search/?api=1&query=2.7724%2C32.2881 | — | all roles: external (new tab, rel=noopener) |  |
| main | RSVP for Google I/O Extended watch-party & talks | /go/ev-ioext | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open London, UK + livestream in Google Maps (new | https://www.google.com/maps/search/?api=1&query=51.5072%2C-0.1276 | — | all roles: external (new tab, rel=noopener) |  |
| main | RSVP for Claude builders meetup on the organiser | /go/ev-anthropic | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open Nairobi, Kenya in Google Maps (new tab) | https://www.google.com/maps/search/?api=1&query=-1.2921%2C36.8219 | — | all roles: external (new tab, rel=noopener) |  |
| main | RSVP for AWS Community Day East Africa on the or | /go/ev-awscd | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open Kigali, Rwanda in Google Maps (new tab) | https://www.google.com/maps/search/?api=1&query=-1.9441%2C30.0619 | — | all roles: external (new tab, rel=noopener) |  |
| main | RSVP for Africa AI & Data conference on the orga | /go/ev-ai-conf | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | 101 Python Study Jam (beginners) 101 Kampala Hac | not clicked | — | all roles: same as now |  |
| main | Check in | skipped(cap) | — | all roles: same as now |  |
| main | CSV | skipped(cap) | — | all roles: same as now |  |
| main | Google Developer Groups Microsoft OpenAI Anthrop | not clicked | — | all roles: same as now |  |
| main | Hackathon Meetup Conference Workshop Webinar Stu | not clicked | — | all roles: same as now |  |
| main | Kampala Uganda Africa Online Worldwide | not clicked | — | all roles: same as now |  |
| main | UGX USD KES | not clicked | — | all roles: same as now |  |
| main | Submit for review | skipped(cap) | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | Open 101 AI assistant | skipped(cap) | — | all roles: same as now |  |

### go.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Browse the Library | /resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  |
| top | 101 Codecrafts | /index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |

### groups.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All | opens/changes UI | — | all roles: same as now |  |
| main | Study group | opens/changes UI | — | all roles: same as now |  |
| main | Project team | opens/changes UI | — | all roles: same as now |  |
| main | School chapter | opens/changes UI | — | all roles: same as now |  |
| main | All levels | opens/changes UI | — | all roles: same as now |  |
| main | Primary | opens/changes UI | — | all roles: same as now |  |
| main | O-Level | opens/changes UI | — | all roles: same as now |  |
| main | A-Level | opens/changes UI | — | all roles: same as now |  |
| main | University | opens/changes UI | — | all roles: same as now |  |
| main | Professional | opens/changes UI | — | all roles: same as now |  |
| main | Python Night Owls | groups.html?id=g1 | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | Join | gone | — | **visitor**: /auth?mode=signup; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: hidden; **root**: hidden |  |
| main | BodaSafe Core Team | groups.html?id=g2 | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | Request | gone | — | all roles: same as now |  |
| main | Cavendish University Chapter | groups.html?id=g3 | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | Kings College Budo Coding Club | groups.html?id=g4 | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | Scratch Starters | groups.html?id=g5 | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | CCNA Study Circle | groups.html?id=g6 | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### ide.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | C++ 17 Java 17 Python 3.12 JavaScript (Node 20)  | not clicked | — | all roles: same as now |  |
| main | Download | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Run ▶ | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Clear | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### index.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Make your member card | card.html | — | **visitor**: /auth?next=card.html; **guest**: card.html; **learner**: card.html; **tutor**: card.html; **admin**: card.html; **root**: card.html |  |
| main | JOIN OUR COMMUNITY | dashboard.html | — | **visitor**: /auth?next=dashboard.html; **guest**: guest home (new); **learner**: dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | EXPLORE LEARNING PATHS | #paths (in-page) | — | all roles: index.html |  |
| main | Learn, build, collaborate, grow: join 101 Codecr | signup.html | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | LAUNCH MONTH FREE Ends one month after launch | signup.html | — | **visitor**: signup.html (→ /auth?mode=signup); **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | 6 LEARNING PATHS, FROM FIRST LINE OF CODE TO FIR | #paths (in-page) | — | all roles: index.html |  |
| main | VIEW ALL FEATURES | dashboard.html | — | **visitor**: /auth?next=dashboard.html; **guest**: guest home (new); **learner**: dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | EXPERT-LED LEARNING | sessions.html | — | **visitor**: /auth?next=sessions.html; **guest**: upgrade: become a learner or tutor; **learner**: sessions.html; **tutor**: sessions.html; **admin**: sessions.html; **root**: sessions.html |  |
| main | SKILL-BUILDING WORKSHOPS | events.html | — | all roles: events.html |  |
| main | COLLABORATIVE PROJECTS | projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  |
| main | CAREER DEVELOPMENT | opportunities.html | — | all roles: opportunities.html |  |
| main | TECH RESOURCE HUB | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| main | PEER STUDY GROUPS | groups.html | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| main | CERTIFICATION SUPPORT | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | JOIN THE COMMUNITY | dashboard.html | — | **visitor**: /auth?mode=signup; **guest**: community.html; **learner**: community.html; **tutor**: community.html; **admin**: community.html; **root**: community.html |  |
| main | VIEW ALL COURSES | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | VIEW SOFTWARE DEVELOPMENT COURSES | courses.html?path=software-dev | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | VIEW UI/UX DESIGN COURSES | courses.html?path=ui-ux | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | VIEW DATA & AI COURSES | courses.html?path=data-ai | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | VIEW DIGITAL MARKETING COURSES | courses.html?path=digital-marketing | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | VIEW CYBER SECURITY COURSES | courses.html?path=cyber-security | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | VIEW MOBILE DEVELOPMENT COURSES | courses.html?path=mobile-dev | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | FREECODECAMP (OPENS IN A NEW TAB) | /go/p-freecodecamp | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | COURSERA (OPENS IN A NEW TAB) | /go/p-coursera | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | EDX (OPENS IN A NEW TAB) | /go/p-edx | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | KHAN ACADEMY (OPENS IN A NEW TAB) | /go/p-khan | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | MIT OPENCOURSEWARE (OPENS IN A NEW TAB) | /go/p-mitocw | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | GOOGLE (OPENS IN A NEW TAB) | /go/p-google | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | MICROSOFT LEARN (OPENS IN A NEW TAB) | /go/p-microsoft | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | CISCO NETACAD (OPENS IN A NEW TAB) | /go/p-cisco | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | BROWSE COURSES | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | PYTHON | courses.html?skill=python | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | HTML & CSS | courses.html?skill=html-css | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | UI DESIGN | courses.html?skill=ui-design | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | CLOUD | courses.html?skill=cloud | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | CYBER SECURITY | courses.html?skill=cyber-security | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | DATA ANALYSIS | courses.html?skill=data-analysis | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| main | EXPLORE ALL | news.html | — | all roles: news.html |  |
| main | 101 Hackathon registration is open | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| main | New: Daily Tech News and Opportunities | opportunities.html | — | all roles: opportunities.html |  |
| main | Python Foundations: live session moved to Thursd | news.html | — | all roles: news.html |  |
| main | Share | https://wa.me/?text=Today%20in%20Tech%20on%20101%20Codecrafts%20https%3A%2F%2Fmembers-site-staging.vercel.app%2Findex.ht | — | all roles: external (new tab, rel=noopener) |  |
| main | All news | news.html | — | all roles: news.html |  |
| main | AI We're Building AI to Replace Ourselves. What' | /go/dev-4971955 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Security How Hackers Weaponized DEV.to's Mention | /go/dev-4977578 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Dev Scared to Publish Your First Technical Artic | /go/dev-4976856 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Dev Meet Necoz! 😸 Small. Simple. Useful. | /go/dev-4956710 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Security "Mandatory user verification" on DEV is | /go/dev-4977310 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Dev Svelte 5 Isn't Pure Compiler Magic: How Rune | /go/dev-4828068 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Dev Gemma 4 E2B in JAX on One TPU v5e: bf16 or 4 | /go/dev-4972397 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | AI Crows, Moths, and Makefiles: How 300 Megabyte | /go/dev-4978154 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | AI Securing an Angular Firebase AI App with Emai | /go/dev-4976371 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | AI Leveling the Playing Field: Building a 100% O | /go/dev-4975841 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | We're Building AI to Replace Ourselves. What's t | /go/dev-4971955 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | How Hackers Weaponized DEV.to's Mention System t | /go/dev-4977578 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Scared to Publish Your First Technical Article?  | /go/dev-4976856 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | JOIN 101 CODECRAFTS | signup.html | — | **visitor**: signup.html (→ /auth?mode=signup); **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |
| footer | Resources | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| top | HOME | index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| top | LEARN | courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| top | COMMUNITY | community.html | — | all roles: community.html |  |
| top | RESOURCES | resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| top | ABOUT | about.html | — | all roles: about.html |  |
| top | Search 101 Codecrafts | opens/changes UI | — | all roles: same as now |  |
| top | LOGIN | signin.html | — | **visitor**: signin.html (→ /auth); **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| top | JOIN COMMUNITY | signup.html | — | **visitor**: /auth?mode=signup; **guest**: community.html; **learner**: community.html; **tutor**: community.html; **admin**: community.html; **root**: community.html |  |

### interview.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Learn | learn.html | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  |
| main | Practice | practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Online IDE | ide.html | — | **visitor**: /auth?next=ide.html; **guest**: ide.html (ok*); **learner**: ide.html; **tutor**: ide.html; **admin**: ide.html; **root**: ide.html |  |
| main | Contests | contests.html | — | **visitor**: /auth?next=contests.html; **guest**: contests.html (ok*); **learner**: contests.html; **tutor**: contests.html; **admin**: contests.html; **root**: contests.html |  |
| main | Interview prep | interview.html | — | **visitor**: /auth?next=interview.html; **guest**: interview.html (ok*); **learner**: interview.html; **tutor**: interview.html; **admin**: interview.html; **root**: interview.html |  |
| main | All 6 sets | opens/changes UI | — | all roles: same as now |  |
| main | Google 48 problems · 30 MCQs DSA · System design | opens/changes UI | — | all roles: same as now |  |
| main | Amazon 62 problems · 40 MCQs DSA · Leadership pr | opens/changes UI | — | all roles: same as now |  |
| main | Microsoft 41 problems · 25 MCQs DSA · OOP | opens/changes UI | — | all roles: same as now |  |
| main | MTN 18 problems · 30 MCQs Networking · SQL · Tel | opens/changes UI | — | all roles: same as now |  |
| main | Airtel 14 problems · 20 MCQs Networking · Linux | opens/changes UI | — | all roles: same as now |  |
| main | Safaricom 21 problems · 25 MCQs DSA · M-Pesa API | opens/changes UI | — | all roles: same as now |  |
| main | Andela 26 problems · 30 MCQs JavaScript · Python | opens/changes UI | — | all roles: same as now |  |
| main | Flutterwave 17 problems · 20 MCQs Payments · Nod | opens/changes UI | — | all roles: same as now |  |
| main | Stanbic Bank 9 problems · 20 MCQs SQL · Java · S | opens/changes UI | — | all roles: same as now |  |
| main | Amazon SDE-1 — Arrays & Strings | practice.html?company=amazon | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Google L3 — Graphs warm-up | practice.html?company=google | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | MTN Graduate Trainee — Networking MCQ | practice.html?company=mtn | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Andela — JavaScript fundamentals | practice.html?company=andela | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Flutterwave — Backend & payments | practice.html?company=flutterwave | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Microsoft — Trees & recursion | practice.html?company=microsoft | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | A O(n) | opens/changes UI | — | all roles: same as now |  |
| main | B O(log n) | NO-OP | — | all roles: same as now | 🔴 dead |
| main | C O(n log n) | opens/changes UI | — | all roles: same as now |  |
| main | D O(1) | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### launchpad.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Submit your product | projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  |
| main | All levels | opens/changes UI | — | all roles: same as now |  |
| main | Primary | opens/changes UI | — | all roles: same as now |  |
| main | O-Level | opens/changes UI | — | all roles: same as now |  |
| main | A-Level | opens/changes UI | — | all roles: same as now |  |
| main | University | opens/changes UI | — | all roles: same as now |  |
| main | Professional | opens/changes UI | — | all roles: same as now |  |
| main | BodaSafe | product.html?id=boda-safe | — | **visitor**: /auth?next=product.html; **guest**: product.html (ok (buy only)); **learner**: product.html; **tutor**: product.html; **admin**: product.html; **root**: product.html |  |
| main | Upvote BodaSafe | gone | — | all roles: same as now |  |
| main | UNEB Buddy | product.html?id=uneb-buddy | — | **visitor**: /auth?next=product.html; **guest**: product.html (ok (buy only)); **learner**: product.html; **tutor**: product.html; **admin**: product.html; **root**: product.html |  |
| main | Upvote UNEB Buddy | gone | — | all roles: same as now |  |
| main | Matooke Market | product.html?id=matooke-market | — | **visitor**: /auth?next=product.html; **guest**: product.html (ok (buy only)); **learner**: product.html; **tutor**: product.html; **admin**: product.html; **root**: product.html |  |
| main | Upvote Matooke Market | gone | — | all roles: same as now |  |
| main | Scratch Quest | product.html?id=scratch-quest | — | **visitor**: /auth?next=product.html; **guest**: product.html (ok (buy only)); **learner**: product.html; **tutor**: product.html; **admin**: product.html; **root**: product.html |  |
| main | Upvote Scratch Quest | gone | — | all roles: same as now |  |
| main | LogSight | product.html?id=logsight | — | **visitor**: /auth?next=product.html; **guest**: product.html (ok (buy only)); **learner**: product.html; **tutor**: product.html; **admin**: product.html; **root**: product.html |  |
| main | Upvote LogSight | gone | — | all roles: same as now |  |
| main | Lab Booker | product.html?id=lab-booker | — | **visitor**: /auth?next=product.html; **guest**: product.html (ok (buy only)); **learner**: product.html; **tutor**: product.html; **admin**: product.html; **root**: product.html |  |
| main | Upvote Lab Booker | gone | — | all roles: same as now |  |
| main | FEATURED UNEB Buddy Past papers + AI explanation | product.html?id=uneb-buddy | — | **visitor**: /auth?next=product.html; **guest**: product.html (ok (buy only)); **learner**: product.html; **tutor**: product.html; **admin**: product.html; **root**: product.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### learn.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Learn | learn.html | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  |
| main | Practice | practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Online IDE | ide.html | — | **visitor**: /auth?next=ide.html; **guest**: ide.html (ok*); **learner**: ide.html; **tutor**: ide.html; **admin**: ide.html; **root**: ide.html |  |
| main | Contests | contests.html | — | **visitor**: /auth?next=contests.html; **guest**: contests.html (ok*); **learner**: contests.html; **tutor**: contests.html; **admin**: contests.html; **root**: contests.html |  |
| main | Interview prep | interview.html | — | **visitor**: /auth?next=interview.html; **guest**: interview.html (ok*); **learner**: interview.html; **tutor**: interview.html; **admin**: interview.html; **root**: interview.html |  |
| main | All levels Beginner Intermediate Advanced | not clicked | — | all roles: same as now |  |
| main | All education levels Secondary (S1–S6) Universit | not clicked | — | all roles: same as now |  |
| main | All topics 20 | opens/changes UI | — | all roles: same as now |  |
| main | DSA 5 | opens/changes UI | — | all roles: same as now |  |
| main | Python 2 | opens/changes UI | — | all roles: same as now |  |
| main | JavaScript 1 | opens/changes UI | — | all roles: same as now |  |
| main | Web 2 | opens/changes UI | — | all roles: same as now |  |
| main | Databases 2 | opens/changes UI | — | all roles: same as now |  |
| main | ML / AI 2 | opens/changes UI | — | all roles: same as now |  |
| main | Networking 2 | opens/changes UI | — | all roles: same as now |  |
| main | Cyber security 2 | opens/changes UI | — | all roles: same as now |  |
| main | Mobile 2 | opens/changes UI | — | all roles: same as now |  |
| main | Two Pointer Technique | article.html?slug=two-pointer-technique | — | all roles: article.html |  |
| main | Binary Search: Iterative and Recursive | article.html?slug=binary-search | — | all roles: article.html |  |
| main | Kadane's Algorithm — Maximum Subarray Sum | article.html?slug=kadanes-algorithm | — | all roles: article.html |  |
| main | BFS vs DFS on Graphs | article.html?slug=bfs-dfs-graphs | — | all roles: article.html |  |
| main | Reverse a Linked List | article.html?slug=linked-list-reverse | — | all roles: article.html |  |
| main | Python List Comprehensions | article.html?slug=python-list-comprehensions | — | all roles: article.html |  |
| main | Object-Oriented Python: Classes and Objects | article.html?slug=python-oop | — | all roles: article.html |  |
| main | Promises and async/await in JavaScript | article.html?slug=js-promises-async | — | all roles: article.html |  |
| main | CSS Flexbox vs Grid | article.html?slug=css-flexbox-grid | — | all roles: article.html |  |
| main | Web Accessibility Basics | article.html?slug=web-accessibility-basics | — | all roles: article.html |  |
| main | SQL Joins Explained | article.html?slug=sql-joins | — | all roles: article.html |  |
| main | Database Normalization (1NF–3NF) | article.html?slug=db-normalization | — | all roles: article.html |  |
| main | Linear Regression from Scratch | article.html?slug=linear-regression | — | all roles: article.html |  |
| main | Prompting LLMs for Code | article.html?slug=prompting-llms | — | all roles: article.html |  |
| main | IPv4 Subnetting Made Simple | article.html?slug=subnetting | — | all roles: article.html |  |
| main | The OSI Model in 7 Layers | article.html?slug=osi-model | — | all roles: article.html |  |
| main | OWASP Top 10 for Beginners | article.html?slug=owasp-top-10 | — | all roles: article.html |  |
| main | Hashing vs Encryption | article.html?slug=hashing-vs-encryption | — | all roles: article.html |  |
| main | Your First Flutter App | article.html?slug=flutter-first-app | — | all roles: article.html |  |
| main | Integrating Mobile Money APIs | article.html?slug=mobile-money-api | — | all roles: article.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### marketplace.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All categories | opens/changes UI | — | all roles: same as now |  |
| main | Search | opens/changes UI | — | all roles: same as now |  |
| main | Orders | orders.html | — | **visitor**: /auth?next=orders.html; **guest**: orders.html; **learner**: orders.html; **tutor**: orders.html; **admin**: orders.html; **root**: orders.html |  |
| main | RFQ | rfq.html | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Cart | cart.html | — | **visitor**: /auth?next=cart.html; **guest**: cart.html; **learner**: cart.html; **tutor**: cart.html; **admin**: cart.html; **root**: cart.html |  |
| main | Software & Apps | marketplace.html?cat=software#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Templates & UI kits | marketplace.html?cat=templates#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Courses bundles | marketplace.html?cat=courses#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Laptops & Gadgets | marketplace.html?cat=laptops#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Electronics components/IoT | marketplace.html?cat=iot#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Services (design, dev, tutoring) | marketplace.html?cat=services#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Books | marketplace.html?cat=books#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Post a buying request | rfq.html | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Sell on 101 | seller.html | — | **visitor**: /auth?next=…; **guest**: upgrade: become a learner or tutor; **learner**: seller flow (admin approval); **tutor**: seller flow (admin approval); **admin**: seller flow (admin approval); **root**: seller flow (admin approval) |  |
| main | Shop laptops → | marketplace.html?cat=laptops#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Previous slide | opens/changes UI | — | all roles: same as now |  |
| main | Slide 1: BACK-TO-CAMPUS | opens/changes UI | — | all roles: same as now |  |
| main | Slide 2: IOT STARTER WEEK | opens/changes UI | — | all roles: same as now |  |
| main | Slide 3: MADE BY 101 MEMBERS | opens/changes UI | — | all roles: same as now |  |
| main | Next slide | opens/changes UI | — | all roles: same as now |  |
| main | Pause carousel | opens/changes UI | — | all roles: same as now |  |
| main | −57% | product-item.html?id=mk-book-net<br>product-item.html?id=mk-esp32<br>product-item.html?id=mk-headset<br>product-item.htm | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | CCNA 200-301 study guide · used, good condition | product-item.html?id=mk-book-net | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add CCNA 200-301 study guide · used, good condit | opens/changes UI | — | all roles: same as now |  |
| main | −33% MADE BY 101 | product-item.html?id=mk-bundle-data<br>product-item.html?id=mk-bundle-web<br>product-item.html?id=mk-pos-app<br>product- | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Full-stack web bundle · 4 courses + certificate | product-item.html?id=mk-bundle-web | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Full-stack web bundle · 4 courses + certific | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | Restaurant & café website template (HTML + MoMo  | product-item.html?id=mk-web-tpl | — | **visitor**: /auth?next=…; **guest**: ok; **learner**: ok; **tutor**: ok; **admin**: ok; **root**: ok |  |
| main | Add Restaurant & café website template (HTML + M | opens/changes UI<br>skipped(cap) | — | **visitor**: /auth?next=…; **guest**: ok; **learner**: ok; **tutor**: ok; **admin**: ok; **root**: ok |  |
| main | DukaPOS · point-of-sale for shops (MoMo receipts | product-item.html?id=mk-pos-app | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add DukaPOS · point-of-sale for shops (MoMo rece | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | USB headset with noise-cancelling mic (online cl | product-item.html?id=mk-headset | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add USB headset with noise-cancelling mic (onlin | opens/changes UI | — | all roles: same as now |  |
| main | 37-in-1 sensor kit for Arduino & ESP32 (with UG  | product-item.html?id=mk-sensor-kit | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add 37-in-1 sensor kit for Arduino & ESP32 (with | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | HP EliteBook 840 G6 · Core i5 8th gen, 16GB RAM, | product-item.html?id=mk-hp-elitebook | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add HP EliteBook 840 G6 · Core i5 8th gen, 16GB  | opens/changes UI | — | all roles: same as now |  |
| main | ESP32 DevKit V1 · WiFi + Bluetooth (pack of 2) | product-item.html?id=mk-esp32 | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add ESP32 DevKit V1 · WiFi + Bluetooth (pack of  | opens/changes UI | — | all roles: same as now |  |
| main | MADE BY 101 | product-item.html?id=mk-bundle-sec<br>product-item.html?id=mk-deck<br>product-item.html?id=mk-school-sys<br>product-item | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Brutal UI kit · 240 Figma components (101 style) | product-item.html?id=mk-ui-kit | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Brutal UI kit · 240 Figma components (101 st | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | Logo + brand kit design (3 concepts, 2 revisions | product-item.html?id=mk-svc-logo | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Logo + brand kit design (3 concepts, 2 revis | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | 1-on-1 Python tutoring · 4 sessions (online or K | product-item.html?id=mk-svc-tutor | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add 1-on-1 Python tutoring · 4 sessions (online  | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | Business website build (5 pages, domain + hostin | product-item.html?id=mk-svc-web | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Business website build (5 pages, domain + ho | opens/changes UI<br>skipped(cap) | — | all roles: same as now |  |
| main | SchoolDesk · fees, report cards & SMS for UG sch | product-item.html?id=mk-school-sys | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add SchoolDesk · fees, report cards & SMS for UG | opens/changes UI | — | all roles: same as now |  |
| main | AMAZON | /go/amz-kindle | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Kindle Paperwhite (16GB) (opens Amazon in a new  | /go/amz-kindle | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | View on Amazon ↗ | /go/amz-kindle | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | AMAZON | /go/amz-logitech | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Logitech MX Keys keyboard (opens Amazon in a new | /go/amz-logitech | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | View on Amazon ↗ | /go/amz-logitech | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | AMAZON | /go/amz-ssd | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Samsung 990 EVO 1TB NVMe SSD (opens Amazon in a  | /go/amz-ssd | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | View on Amazon ↗ | /go/amz-ssd | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | ALIBABA | /go/ali-esp32-bulk | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | ESP32-WROOM modules · bulk (MOQ 100) (opens Alib | /go/ali-esp32-bulk | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | View on Alibaba ↗ | /go/ali-esp32-bulk | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | ALIBABA | /go/ali-pcb | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Custom PCB prototyping (10 pcs) (opens Alibaba i | /go/ali-pcb | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | View on Alibaba ↗ | /go/ali-pcb | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | ALIBABA | /go/ali-solar | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | 5V solar panel + charge module (MOQ 50) (opens A | /go/ali-solar | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | View on Alibaba ↗ | /go/ali-solar | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Filters | skipped(cap) | — | all roles: same as now |  |
| main | Category | not clicked | — | all roles: same as now |  |
| main | Under 100k | skipped(cap) | — | all roles: same as now |  |
| main | 100k–500k | skipped(cap) | — | all roles: same as now |  |
| main | 500k+ | skipped(cap) | — | all roles: same as now |  |
| main | Clear filters | skipped(cap) | — | all roles: same as now |  |
| main | Best match Best selling Price: low to high Price | not clicked | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | Grid view | skipped(cap) | — | all roles: same as now |  |
| main | List view | skipped(cap) | — | all roles: same as now |  |
| main | Data & AI bundle · Python, pandas, ML basics | product-item.html?id=mk-bundle-data | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Data & AI bundle · Python, pandas, ML basics | skipped(cap) | — | all roles: same as now |  |
| main | Cybersecurity bundle · ethical hacking + network | product-item.html?id=mk-bundle-sec | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Cybersecurity bundle · ethical hacking + net | skipped(cap) | — | all roles: same as now |  |
| main | WhatsApp order bot starter (Node.js, menus, MoMo | product-item.html?id=mk-wa-bot | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add WhatsApp order bot starter (Node.js, menus,  | skipped(cap) | — | all roles: same as now |  |
| main | Startup pitch deck template (20 slides, investor | product-item.html?id=mk-deck | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Startup pitch deck template (20 slides, inve | skipped(cap) | — | all roles: same as now |  |
| main | Previous page | not clicked | — | all roles: same as now |  |
| main | Page 1 | skipped(cap) | — | all roles: same as now |  |
| main | Next page | skipped(cap) | — | all roles: same as now |  |
| main | Open 101 AI assistant | skipped(cap) | — | all roles: same as now |  |
| top | See all deals → | #browse (in-page) | — | all roles: index.html |  |
| top | Browse all → | #browse (in-page) | — | all roles: index.html |  |

### news.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Open | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| main | All announcements | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| main | Hide pinned announcement | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Saved (0) | opens/changes UI | — | all roles: same as now |  |
| main | Share on WhatsApp | https://wa.me/?text=Today%20in%20tech%20on%20101%20Codecrafts%3A%20https%3A%2F%2Fmembers-site-staging.vercel.app%2Fnews. | — | all roles: external (new tab, rel=noopener) |  |
| main | All | opens/changes UI | — | all roles: same as now |  |
| main | Africa & Uganda | opens/changes UI | — | all roles: same as now |  |
| main | AI | opens/changes UI | — | all roles: same as now |  |
| main | Dev | opens/changes UI | — | all roles: same as now |  |
| main | Startups | opens/changes UI | — | all roles: same as now |  |
| main | Save | gone<br>skipped(cap) | — | all roles: same as now |  |
| main | Ugandan fintechs push Mobile Money APIs to more  | /go/fn1 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on TechCabal (opens in a new tab) | /go/fn1 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Explain with 101 AI | gone<br>skipped(cap) | — | all roles: same as now |  |
| main | Small open-weight models now run well on mid-ran | /go/fn2 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Hacker News (opens in a new tab) | /go/fn2 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Node.js and Python both ship security releases t | /go/fn3 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on The Hacker News (opens in a new tab) | /go/fn3 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | East African startup funding: seed rounds hold s | /go/fn4 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Disrupt Africa (opens in a new tab) | /go/fn4 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Kampala innovation hubs open more free evening b | /go/fn5 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Daily Monitor (opens in a new tab) | /go/fn5 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Speech models add better support for African lan | /go/fn6 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Hugging Face (opens in a new tab) | /go/fn6 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | GitHub Student Pack adds more free cloud and AI  | /go/fn7 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on GitHub Blog (opens in a new tab) | /go/fn7 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | What accelerators look for in a first-time found | /go/fn8 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on TechCrunch (opens in a new tab) | /go/fn8 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Nairobi and Lagos devs share tips on landing rem | /go/fn9 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on TechCabal (opens in a new tab) | /go/fn9 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | How to write prompts that give reproducible code | /go/fn10 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/fn10 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Web performance: the cheapest wins for slow mobi | /go/fn11 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on web.dev (opens in a new tab) | /go/fn11 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Bootstrapped SaaS from Africa: pricing in local  | /go/fn12 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Indie Hackers (opens in a new tab) | /go/fn12 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | We're Building AI to Replace Ourselves. What's t | /go/dev-4971955 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4971955 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | How Hackers Weaponized DEV.to's Mention System t | /go/dev-4977578 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4977578 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Scared to Publish Your First Technical Article?  | /go/dev-4976856 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4976856 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Meet Necoz! 😸 Small. Simple. Useful. (opens in a | /go/dev-4956710 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4956710 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | "Mandatory user verification" on DEV is a scam.  | /go/dev-4977310 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4977310 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Svelte 5 Isn't Pure Compiler Magic: How Runes, F | /go/dev-4828068 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4828068 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Gemma 4 E2B in JAX on One TPU v5e: bf16 or 4-Bit | /go/dev-4972397 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4972397 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Crows, Moths, and Makefiles: How 300 Megabytes o | /go/dev-4978154 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4978154 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Securing an Angular Firebase AI App with Email/P | /go/dev-4976371 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4976371 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Leveling the Playing Field: Building a 100% Offl | /go/dev-4975841 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4975841 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | After 5 years, Wasp 1.0 is coming: a 6-month pla | /go/dev-4974671 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4974671 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | How I build products with AI: from a brainstorm  | /go/dev-4975510 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Read on Dev.to (opens in a new tab) | /go/dev-4975510 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open 101 AI assistant | skipped(cap) | — | all roles: same as now |  |

### offline.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Codecrafts | index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | Try again | reload | — | all roles: same as now |  |
| main | Open saved dashboard | dashboard.html | — | **visitor**: /auth?next=dashboard.html; **guest**: guest home (new); **learner**: dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | View settings: Lite mode, language, theme | gone | — | all roles: same as now |  |
| main | Open 101 AI assistant | gone | — | all roles: same as now |  |

### onboarding.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Codecrafts | index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | Learner | opens/changes UI | — | all roles: same as now |  |
| main | Tutor | opens/changes UI | — | all roles: same as now |  |
| main | Back | not clicked | — | all roles: same as now |  |
| main | Next | opens/changes UI | — | all roles: same as now |  |
| main | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### opportunities.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Open | competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| main | All announcements | announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| main | Hide pinned announcement | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Submit an opportunity | #submit-opp (in-page) | — | all roles: index.html |  |
| main | 101 Codecrafts Kampala Hackathon , 2d 15h left ( | /go/op1 | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| main | Huawei ICT Competition , 3d 15h left (opens in a | /go/op10 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Zindi data science challenge , 4d 15h left (open | /go/op6 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Mastercard Foundation Scholars Program , 5d 15h  | /go/op2 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Software Engineering Intern (Remote, Africa) , 6 | /go/op3 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | All types Scholarship Internship Job Hackathon G | not clicked | — | all roles: same as now |  |
| main | All levels High school Undergraduate Graduate An | not clicked | — | all roles: same as now |  |
| main | Anywhere Remote Uganda Africa | not clicked | — | all roles: same as now |  |
| main | Deadline soon (7 days) | opens/changes UI | — | all roles: same as now |  |
| main | Saved | opens/changes UI | — | all roles: same as now |  |
| main | Save | gone | — | all roles: same as now |  |
| main | Apply for 101 Codecrafts Kampala Hackathon on 10 | /go/op1 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Remind me | gone | — | all roles: same as now |  |
| main | Apply for Huawei ICT Competition on Huawei site  | /go/op10 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Apply for Zindi data science challenge on Zindi  | /go/op6 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Apply for Mastercard Foundation Scholars Program | /go/op2 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Apply for Software Engineering Intern (Remote, A | /go/op3 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Apply for ALX Software Engineering (free) on ALX | /go/op7 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Apply for Google for Startups Accelerator: Afric | /go/op4 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Apply for Mozilla Technology Fund (open call) on | /go/op5 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Apply for Junior Frontend Developer on Kampala f | /go/op8 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Apply for DAAD In-Country/In-Region Scholarships | /go/op9 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Scholarship Internship Job Hackathon Grant Fello | not clicked | — | all roles: same as now |  |
| main | High school Undergraduate Graduate Any | not clicked | — | all roles: same as now |  |
| main | Submit for review | opens/changes UI | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | Open 101 AI assistant | skipped(cap) | — | all roles: same as now |  |

### orders.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All categories | opens/changes UI | — | all roles: same as now |  |
| main | Search | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Orders | orders.html | — | **visitor**: /auth?next=orders.html; **guest**: orders.html; **learner**: orders.html; **tutor**: orders.html; **admin**: orders.html; **root**: orders.html |  |
| main | RFQ | rfq.html | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Cart | cart.html | — | **visitor**: /auth?next=cart.html; **guest**: cart.html; **learner**: cart.html; **tutor**: cart.html; **admin**: cart.html; **root**: cart.html |  |
| main | Software & Apps | marketplace.html?cat=software#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Templates & UI kits | marketplace.html?cat=templates#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Courses bundles | marketplace.html?cat=courses#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Laptops & Gadgets | marketplace.html?cat=laptops#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Electronics components/IoT | marketplace.html?cat=iot#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Services (design, dev, tutoring) | marketplace.html?cat=services#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Books | marketplace.html?cat=books#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Keep shopping | marketplace.html | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | All | opens/changes UI | — | all roles: same as now |  |
| main | In progress | opens/changes UI | — | all roles: same as now |  |
| main | Completed | opens/changes UI | — | all roles: same as now |  |
| main | Disputes | opens/changes UI | — | all roles: same as now |  |
| main | ESP32 DevKit V1 · WiFi + Bluetooth (pack of 2) × | product-item.html?id=mk-esp32 | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Confirm delivery | gone | — | all roles: same as now |  |
| main | Return / dispute | gone | — | all roles: same as now |  |
| main | Brutal UI kit · 240 Figma components (101 style) | product-item.html?id=mk-ui-kit | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Write a review | product-item.html?id=mk-ui-kit#p-rev | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | HP EliteBook 840 G6 · Core i5 8th gen, 16GB RAM, | product-item.html?id=mk-hp-elitebook | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### practice.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Learn | learn.html | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  |
| main | Practice | practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Online IDE | ide.html | — | **visitor**: /auth?next=ide.html; **guest**: ide.html (ok*); **learner**: ide.html; **tutor**: ide.html; **admin**: ide.html; **root**: ide.html |  |
| main | Contests | contests.html | — | **visitor**: /auth?next=contests.html; **guest**: contests.html (ok*); **learner**: contests.html; **tutor**: contests.html; **admin**: contests.html; **root**: contests.html |  |
| main | Interview prep | interview.html | — | **visitor**: /auth?next=interview.html; **guest**: interview.html (ok*); **learner**: interview.html; **tutor**: interview.html; **admin**: interview.html; **root**: interview.html |  |
| main | Solve now | problem.html?id=kadane | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | All Easy Medium Hard | not clicked | — | all roles: same as now |  |
| main | All topics Arrays Dynamic Programming Graphs Lin | not clicked | — | all roles: same as now |  |
| main | All companies Google Amazon Microsoft MTN Airtel | not clicked | — | all roles: same as now |  |
| main | All Solved Attempted Not attempted | not clicked | — | all roles: same as now |  |
| main | Pair Sum in Sorted Array | problem.html?id=pair-sum-sorted | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Reverse an Array | problem.html?id=reverse-array | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Remove Duplicates from Sorted Array | problem.html?id=remove-duplicates | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Maximum Subarray Sum | problem.html?id=kadane | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Container With Most Water | problem.html?id=container-water | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Valid Parentheses | problem.html?id=valid-parentheses | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | LRU Cache | problem.html?id=lru-cache | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Shortest Path in Unweighted Graph | problem.html?id=bfs-shortest | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Mobile Money Daily Balance | problem.html?id=mobile-money-balance | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Longest Substring Without Repeating Characters | problem.html?id=longest-substring | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Edit Distance | problem.html?id=edit-distance | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Level Order Traversal | problem.html?id=level-order | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Boda Routes (Count Paths in DAG) | problem.html?id=boda-routes | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | N-Queens | problem.html?id=n-queens | — | **visitor**: /auth?next=problem.html; **guest**: problem.html (ok*); **learner**: problem.html; **tutor**: problem.html; **admin**: problem.html; **root**: problem.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### privacy.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | privacy@101codecrafts.org | mailto:privacy@101codecrafts.org | — | all roles: mailto:privacy@101codecrafts.org |  |
| main | View settings: Lite mode, language, theme | opens/changes UI | — | all roles: same as now |  |

### problem.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Practice | practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| main | Statement | opens/changes UI | — | all roles: same as now |  |
| main | Examples | opens/changes UI | — | all roles: same as now |  |
| main | Constraints | opens/changes UI | — | all roles: same as now |  |
| main | Editorial | opens/changes UI | — | all roles: same as now |  |
| main | Hints | opens/changes UI | — | all roles: same as now |  |
| main | Resize panels (left/right arrow keys) | NO-OP | — | all roles: same as now | 🔴 dead |
| main | C++ 17 Java 17 Python 3.12 JavaScript (Node 20)  | not clicked | — | all roles: same as now |  |
| main | Reset | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Get a hint | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Debug with 101 AI | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Run | opens/changes UI | — | all roles: same as now |  |
| main | Submit | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### product-item.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All categories | opens/changes UI | — | all roles: same as now |  |
| main | Search | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Orders | orders.html | — | **visitor**: /auth?next=orders.html; **guest**: orders.html; **learner**: orders.html; **tutor**: orders.html; **admin**: orders.html; **root**: orders.html |  |
| main | RFQ | rfq.html | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Cart | cart.html | — | **visitor**: /auth?next=cart.html; **guest**: cart.html; **learner**: cart.html; **tutor**: cart.html; **admin**: cart.html; **root**: cart.html |  |
| main | Software & Apps | marketplace.html?cat=software#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Templates & UI kits | marketplace.html?cat=templates#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Courses bundles | marketplace.html?cat=courses#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Laptops & Gadgets | marketplace.html?cat=laptops#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Electronics components/IoT | marketplace.html?cat=iot#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Services (design, dev, tutoring) | marketplace.html?cat=services#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Books | marketplace.html?cat=books#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Marketplace | marketplace.html | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Laptops (refurbished) | marketplace.html?cat=laptops&sub=Laptops%20(refurbished)#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Toggle zoom | opens/changes UI | — | all roles: same as now |  |
| main | Image 1 of 4 | opens/changes UI | — | all roles: same as now |  |
| main | Image 2 of 4: side view | opens/changes UI | — | all roles: same as now |  |
| main | Image 3 of 4: top view | opens/changes UI | — | all roles: same as now |  |
| main | Image 4 of 4: detail view | opens/changes UI | — | all roles: same as now |  |
| main | 4.6 · 128 reviews | #p-rev (in-page) | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | 8GB −120k | opens/changes UI | — | all roles: same as now |  |
| main | 16GB | opens/changes UI | — | all roles: same as now |  |
| main | 32GB +210k | opens/changes UI | — | all roles: same as now |  |
| main | 256GB SSD | opens/changes UI | — | all roles: same as now |  |
| main | 512GB SSD +95k | opens/changes UI | — | all roles: same as now |  |
| main | Decrease quantity | opens/changes UI | — | all roles: same as now |  |
| main | Increase quantity | opens/changes UI | — | all roles: same as now |  |
| main | Kampala (Kampala, Wakiso, Mukono) Upcountry (oth | not clicked | — | all roles: same as now |  |
| main | Add to cart | opens/changes UI | — | **visitor**: /auth?next=…; **guest**: ok; **learner**: ok; **tutor**: ok; **admin**: ok; **root**: ok |  |
| main | Buy now | nav:/checkout.html | — | **visitor**: /auth?next=…; **guest**: ok; **learner**: ok; **tutor**: ok; **admin**: ok; **root**: ok |  |
| main | Wishlist | opens/changes UI | — | all roles: same as now |  |
| main | Visit shop | marketplace.html?q=Campus%20Laptops%20Ltd#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Ask a question | #p-qa (in-page) | — | all roles: index.html |  |
| main | Request a quote | rfq.html?product=mk-hp-elitebook | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Description | opens/changes UI | — | all roles: same as now |  |
| main | Specs | opens/changes UI | — | all roles: same as now |  |
| main | Reviews | opens/changes UI | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | Q&A | opens/changes UI | — | all roles: same as now |  |
| main | −14% | product-item.html?id=mk-dell-latitude<br>product-item.html?id=mk-esp32<br>product-item.html?id=mk-headset<br>product-ite | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Dell Latitude 5490 · Core i7, 8GB RAM, 512GB SSD | product-item.html?id=mk-dell-latitude | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Dell Latitude 5490 · Core i7, 8GB RAM, 512GB | opens/changes UI | — | all roles: same as now |  |
| main | Tecno Spark 20 · 128GB, dual SIM | product-item.html?id=mk-tecno-spark | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Tecno Spark 20 · 128GB, dual SIM to cart | opens/changes UI | — | all roles: same as now |  |
| main | USB headset with noise-cancelling mic (online cl | product-item.html?id=mk-headset | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add USB headset with noise-cancelling mic (onlin | opens/changes UI | — | all roles: same as now |  |
| main | TP-Link 4G LTE router (unlocked, MTN/Airtel) | product-item.html?id=mk-router | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add TP-Link 4G LTE router (unlocked, MTN/Airtel) | skipped(cap) | — | all roles: same as now |  |
| main | ESP32 DevKit V1 · WiFi + Bluetooth (pack of 2) | product-item.html?id=mk-esp32 | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add ESP32 DevKit V1 · WiFi + Bluetooth (pack of  | skipped(cap) | — | all roles: same as now |  |
| main |  | product-item.html?id=mk-arduino | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Arduino Uno R3 compatible board + USB cable | product-item.html?id=mk-arduino | — | **visitor**: /auth?next=product-item.html; **guest**: product-item.html (ok (buy only)); **learner**: product-item.html; **tutor**: product-item.html; **admin**: product-item.html; **root**: product-item.html |  |
| main | Add Arduino Uno R3 compatible board + USB cable  | skipped(cap) | — | all roles: same as now |  |
| main | Open 101 AI assistant | skipped(cap) | — | all roles: same as now |  |

### product.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Live demo ↗ | https://example.com/bodasafe | — | all roles: external (new tab, rel=noopener) |  |
| main | Repo ↗ | https://github.com/101codecrafts | — | all roles: external (new tab, rel=noopener) |  |
| main | ▲ 214 | opens/changes UI | — | all roles: same as now |  |
| main | Share | nav:/product.html# | — | all roles: index.html |  |
| main | Post | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### profile.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Share profile | nav:/profile.html# | — | all roles: index.html |  |
| main | Make your member card | /card.html | — | **visitor**: /auth?next=card.html; **guest**: card.html; **learner**: card.html; **tutor**: card.html; **admin**: card.html; **root**: card.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |
| top | Sign in | /signin.html | — | **visitor**: /auth; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: hidden; **root**: hidden |  |
| footer | Privacy | /privacy.html | — | all roles: privacy.html |  |
| footer | Terms | /terms.html | — | all roles: terms.html |  |
| sidebar | 101 Codecrafts Build. Learn. Grow. 101 Codecraft | /index.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| sidebar | Home | /dashboard.html | — | **visitor**: /index.html; **guest**: guest home (new); **learner**: /dashboard.html; **tutor**: /tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| sidebar | Community | /profile.html | — | all roles: community.html |  |
| sidebar | Notifications | /announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| sidebar | Learning | /courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| sidebar | Learn | /learn.html | — | **visitor**: /auth?next=learn.html; **guest**: learn.html (ok*); **learner**: learn.html; **tutor**: learn.html; **admin**: learn.html; **root**: learn.html |  |
| sidebar | Practice | /practice.html | — | **visitor**: /auth?next=practice.html; **guest**: practice.html (ok*); **learner**: practice.html; **tutor**: practice.html; **admin**: practice.html; **root**: practice.html |  |
| sidebar | AI Tools | /ai-tools.html | — | **visitor**: /auth?next=ai-tools.html; **guest**: ai-tools.html (ok*); **learner**: ai-tools.html; **tutor**: ai-tools.html; **admin**: ai-tools.html; **root**: ai-tools.html |  |
| sidebar | Projects | /projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  |
| sidebar | Launchpad | /launchpad.html | — | **visitor**: /auth?next=launchpad.html; **guest**: launchpad.html (ok (browse; no posting)); **learner**: launchpad.html; **tutor**: launchpad.html; **admin**: launchpad.html; **root**: launchpad.html |  |
| sidebar | Testing | /testing.html | — | **visitor**: /auth?next=testing.html; **guest**: testing.html (ok (browse; no campaigns)); **learner**: testing.html; **tutor**: testing.html; **admin**: testing.html; **root**: testing.html |  |
| sidebar | Competitions | /competitions.html | — | **visitor**: /auth?next=competitions.html; **guest**: competitions.html (ok*); **learner**: competitions.html; **tutor**: competitions.html; **admin**: competitions.html; **root**: competitions.html |  |
| sidebar | Groups | /groups.html | — | **visitor**: /auth?next=groups.html; **guest**: groups.html (ok*); **learner**: groups.html; **tutor**: groups.html; **admin**: groups.html; **root**: groups.html |  |
| sidebar | Events & Meetups | /events.html | — | all roles: events.html |  |
| sidebar | Marketplace | /marketplace.html | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| sidebar | Daily News | /news.html | — | all roles: news.html |  |
| sidebar | Opportunities | /opportunities.html | — | all roles: opportunities.html |  |
| sidebar | Announcements | /announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| sidebar | Library | /resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| sidebar | My Courses | /courses.html#c101 | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| sidebar | My Projects | /projects.html | — | **visitor**: /auth?next=projects.html; **guest**: upgrade: become a learner or tutor; **learner**: projects.html; **tutor**: projects.html; **admin**: projects.html; **root**: projects.html |  |
| sidebar | My Downloads | /resources.html | — | **visitor**: /auth?next=resources.html; **guest**: resources.html (ok (browse)); **learner**: resources.html; **tutor**: resources.html; **admin**: resources.html; **root**: resources.html |  |
| sidebar | My Profile | /profile.html | — | **visitor**: profile.html (auth (own) / ok (public /u/handle)); **guest**: profile.html; **learner**: profile.html; **tutor**: profile.html; **admin**: profile.html; **root**: profile.html |  |
| sidebar | Member card | /card.html | — | **visitor**: /auth?next=card.html; **guest**: card.html; **learner**: card.html; **tutor**: card.html; **admin**: card.html; **root**: card.html |  |
| sidebar | Settings | /settings-apps.html | — | **visitor**: /auth?next=settings-apps.html; **guest**: settings-apps.html; **learner**: settings-apps.html; **tutor**: settings-apps.html; **admin**: settings-apps.html; **root**: settings-apps.html |  |
| top | News | /news.html | — | all roles: news.html |  |
| top | Opportunities | /opportunities.html | — | all roles: opportunities.html |  |
| top | Events | /events.html | — | all roles: events.html |  |
| top | Notifications | /announcements.html | — | **visitor**: /auth?next=announcements.html; **guest**: announcements.html; **learner**: announcements.html; **tutor**: announcements.html; **admin**: announcements.html; **root**: announcements.html |  |
| top | Join | /signup.html | — | **visitor**: /auth?mode=signup; **guest**: hidden; **learner**: hidden; **tutor**: hidden; **admin**: hidden; **root**: hidden |  |
| footer | Home | /index.html | — | all roles: /index.html |  |
| footer | About | /about.html | — | all roles: about.html |  |
| footer | Community | /community.html | — | all roles: community.html |  |
| footer | Learn | /courses.html | — | **visitor**: /auth?next=courses.html; **guest**: courses.html (ok (external + free only)); **learner**: courses.html; **tutor**: courses.html; **admin**: courses.html; **root**: courses.html |  |
| footer | AI Tools | /ai-tools.html | — | **visitor**: /auth?next=ai-tools.html; **guest**: ai-tools.html (ok*); **learner**: ai-tools.html; **tutor**: ai-tools.html; **admin**: ai-tools.html; **root**: ai-tools.html |  |
| footer | News | /news.html | — | all roles: news.html |  |
| footer | Opportunities | /opportunities.html | — | all roles: opportunities.html |  |
| footer | Events | /events.html | — | all roles: events.html |  |
| footer | Verify a certificate | /verify.html | — | all roles: verify.html |  |

### projects.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | Individual Group | not clicked | — | all roles: same as now |  |
| main | Create | opens/changes UI | — | all roles: same as now |  |
| main | Promote to Launchpad | opens/changes UI | — | all roles: same as now |  |
| main | Start a beta test | testing.html | — | **visitor**: /auth?next=testing.html; **guest**: testing.html (ok (browse; no campaigns)); **learner**: testing.html; **tutor**: testing.html; **admin**: testing.html; **root**: testing.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### resources.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All types | opens/changes UI | — | all roles: same as now |  |
| main | Course | opens/changes UI | — | all roles: same as now |  |
| main | Book | opens/changes UI | — | all roles: same as now |  |
| main | Video | opens/changes UI | — | all roles: same as now |  |
| main | Article | opens/changes UI | — | all roles: same as now |  |
| main | Repo | opens/changes UI | — | all roles: same as now |  |
| main | All levels | opens/changes UI | — | all roles: same as now |  |
| main | Primary | opens/changes UI | — | all roles: same as now |  |
| main | O-Level | opens/changes UI | — | all roles: same as now |  |
| main | A-Level | opens/changes UI | — | all roles: same as now |  |
| main | University | opens/changes UI | — | all roles: same as now |  |
| main | Professional | opens/changes UI | — | all roles: same as now |  |
| main | All learning paths Software Engineering Data Sci | not clicked | — | all roles: same as now |  |
| main | Responsive Web Design Certification , Course on  | /go/fcc-rwd | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | CS50: Introduction to Computer Science , Course  | /go/cs50x | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Machine Learning for Everybody – Full Course , V | /go/yt-ml-crash | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Structure and Interpretation of Computer Program | /go/ol-sicp | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | donnemartin/system-design-primer , Repo on GitHu | /go/gh-system-design | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | OWASP Top 10 Web Application Security Risks , Ar | /go/owasp-top10 | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Kaggle Learn: Pandas , Course on Kaggle (opens i | /go/kaggle-pandas | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Networking Basics , Course on Cisco NetAcad (ope | /go/cisco-netacad | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | JavaScript Guide , Article on MDN Web Docs (open | /go/mdn-js | — | **visitor**: go.html (ok (news) / auth (courses, resources)); **guest**: go.html; **learner**: go.html; **tutor**: go.html; **admin**: go.html; **root**: go.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### rfq.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All categories | opens/changes UI | — | all roles: same as now |  |
| main | Search | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Orders | orders.html | — | **visitor**: /auth?next=orders.html; **guest**: orders.html; **learner**: orders.html; **tutor**: orders.html; **admin**: orders.html; **root**: orders.html |  |
| main | RFQ | rfq.html | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Cart | cart.html | — | **visitor**: /auth?next=cart.html; **guest**: cart.html; **learner**: cart.html; **tutor**: cart.html; **admin**: cart.html; **root**: cart.html |  |
| main | Software & Apps | marketplace.html?cat=software#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Templates & UI kits | marketplace.html?cat=templates#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Courses bundles | marketplace.html?cat=courses#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Laptops & Gadgets | marketplace.html?cat=laptops#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Electronics components/IoT | marketplace.html?cat=iot#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Services (design, dev, tutoring) | marketplace.html?cat=services#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Books | marketplace.html?cat=books#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Software & Apps Templates & UI kits Courses bund | not clicked | — | all roles: same as now |  |
| main | pieces sets laptops licences hours project | not clicked | — | all roles: same as now |  |
| main | Post request | opens/changes UI | — | all roles: same as now |  |
| main | Accept | gone<br>opens/changes UI | — | all roles: same as now |  |
| main | Send quote | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### seller.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | All categories | opens/changes UI | — | all roles: same as now |  |
| main | Search | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Orders | orders.html | — | **visitor**: /auth?next=orders.html; **guest**: orders.html; **learner**: orders.html; **tutor**: orders.html; **admin**: orders.html; **root**: orders.html |  |
| main | RFQ | rfq.html | — | **visitor**: /auth?next=rfq.html; **guest**: rfq.html (ok (buyer side)); **learner**: rfq.html; **tutor**: rfq.html; **admin**: rfq.html; **root**: rfq.html |  |
| main | Cart | cart.html | — | **visitor**: /auth?next=cart.html; **guest**: cart.html; **learner**: cart.html; **tutor**: cart.html; **admin**: cart.html; **root**: cart.html |  |
| main | Software & Apps | marketplace.html?cat=software#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Templates & UI kits | marketplace.html?cat=templates#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Courses bundles | marketplace.html?cat=courses#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Laptops & Gadgets | marketplace.html?cat=laptops#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Electronics components/IoT | marketplace.html?cat=iot#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Services (design, dev, tutoring) | marketplace.html?cat=services#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Books | marketplace.html?cat=books#browse | — | **visitor**: /auth?next=marketplace.html; **guest**: marketplace.html (ok (buy only)); **learner**: marketplace.html; **tutor**: marketplace.html; **admin**: marketplace.html; **root**: marketplace.html |  |
| main | Add product | #add (in-page) | — | all roles: index.html |  |
| main | Request payout | #payouts (in-page) | — | all roles: index.html |  |
| main | Overview | #overview (in-page) | — | all roles: index.html |  |
| main | Orders | #queue (in-page) | — | all roles: index.html |  |
| main | Payouts | #payouts (in-page) | — | all roles: index.html |  |
| main | Analytics | #analytics (in-page) | — | all roles: index.html |  |
| main | Reviews | #reviews (in-page) | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | Software & Apps Templates & UI kits Courses bund | not clicked | — | all roles: same as now |  |
| main | New Refurbished Used | not clicked | — | all roles: same as now |  |
| main | + Add variant option | opens/changes UI | — | all roles: same as now |  |
| main | Submit for review | opens/changes UI | — | **visitor**: /auth?next=…; **guest**: only if enrolled/used; **learner**: only if enrolled/used; **tutor**: only if enrolled/used; **admin**: only if enrolled/used; **root**: only if enrolled/used |  |
| main | Clear | NO-OP | — | all roles: same as now | 🔴 dead |
| main | Accept | opens/changes UI | — | all roles: same as now |  |
| main | Send licence | opens/changes UI | — | all roles: same as now |  |
| main | Mark delivered | opens/changes UI | — | all roles: same as now |  |
| main | MTN MoMo ···· 226 Airtel Money ···· 118 | not clicked | — | all roles: same as now |  |
| main | Request payout | opens/changes UI | — | all roles: same as now |  |
| main | Reply | opens/changes UI | — | all roles: same as now |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |

### session.html

| zone | element | now: visitor | now: signed-in | should | flag |
|---|---|---|---|---|---|
| main | Dismiss launch offer banner | opens/changes UI | — | all roles: same as now |  |
| main | Skip to content | #main (in-page) | — | all roles: index.html |  |
| main | See all sessions | sessions.html | — | **visitor**: /auth?next=sessions.html; **guest**: upgrade: become a learner or tutor; **learner**: sessions.html; **tutor**: sessions.html; **admin**: sessions.html; **root**: sessions.html |  |
| main | Open 101 AI assistant | opens/changes UI | — | all roles: same as now |  |
| sidebar |  | tutor.html | — | **visitor**: /auth?next=tutor.html; **guest**: upgrade: become a learner or tutor; **learner**: tutor.html (deny (offer "become a tutor")); **tutor**: tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| sidebar |  | tutor.html#courses | — | **visitor**: /auth?next=tutor.html; **guest**: upgrade: become a learner or tutor; **learner**: tutor.html (deny (offer "become a tutor")); **tutor**: tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| sidebar |  | tutor.html#learners | — | **visitor**: /auth?next=tutor.html; **guest**: upgrade: become a learner or tutor; **learner**: tutor.html (deny (offer "become a tutor")); **tutor**: tutor.html; **admin**: /admin.html; **root**: /admin.html |  |
| sidebar |  | sessions.html | — | **visitor**: /auth?next=sessions.html; **guest**: upgrade: become a learner or tutor; **learner**: sessions.html; **tutor**: sessions.html; **admin**: sessions.html; **root**: sessions.html |  |
| sidebar |  | tutor.html#earnings | — | **visitor**: /auth?next=tutor.html; **guest**: upgrade: become a learner or tutor; **learner**: tutor.html (deny (offer "become a tutor")); **tutor**: tutor.html; **admin**: /admin.html; **root**: /admin.html |  |

