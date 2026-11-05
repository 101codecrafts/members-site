# Round 11 · audit · progress

- 10:45 EAT  Read BRIEF. Worktrees: `audit/src` = branch r11/audit at main f33b32b (read-only code), `audit/api` = detached backend 3f36f1a.
- 10:55  Static code review: js/auth.js, js/api.js, js/shell.js, js/admin.js, js/tutor.js, js/pages.js (auth/onboarding), backend lib/auth.ts + lib/rbac.ts.
- 11:00  API probe (qa/probe.py → qa/api_probe.json, qa/probe.out): 100 static routes × {anon, QA Learner}; Clerk session JWT refreshed every 40 s (qa/clerkqa.py). Admin/tutor routes: anon 401, learner 403 everywhere.
- 11:05  Contract check of every CC_API call against backend routes (/tmp/v1check.js, results in DEFECTS).
- 11:10  Live crawler qa/crawl.py + qa/chain.sh started (flock on round11/chromium.lock, one chromium at a time): visitor@1440 → learner@1440 → visitor@412 → learner@412, 52 pages each. Output qa/out/<role>-<width>/.
