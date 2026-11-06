# .claude/MEMORY.md — what the agent team learned (short, dated; no secrets, no member data)

- 2026-11-06 r13: root *.html pages are generated from src/ by tools/build.py; edit src/.
- 2026-11-06 r13: API GETs with cacheSeconds are CDN-cached only for visitors; signed-in calls get `private, no-store`
  (backend lib/request-context.ts). The front end sends `X-CC-Viewer` same-origin when a Clerk session cookie exists.
- 2026-11-06 r13: Vercel Hobby cron = once a day; background work goes through the Postgres job queue (app.jobs).
