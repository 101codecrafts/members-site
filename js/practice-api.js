/* 101 Practice & Learn — API client. Every call tries the backend. Round 11: js/practice-data.js mocks (fake problems, people,
   scores, verdicts, AI answers) appear ONLY for ?static=1 or an admin's ?demo=1; a real visit gets the backend's answer or an
   honest empty / unavailable value (no fake verdicts, no canned AI text, no fake success).
   Base: (window.CC_CONFIG.apiBase || "/api"). On file:// and ?static=1 nothing is fetched.

   Contract (JSON in/out):
   GET  /api/v1/articles?topic=&sub=&level=&edu=&q=            -> { items: Article[], total }
   GET  /api/v1/articles/:slug                                  -> Article & { sections: Section[] }
   GET  /api/v1/articles/:slug/comments                         -> { items: Comment[] }
   POST /api/v1/articles/:slug/comments   { text }              -> Comment
   POST /api/v1/articles/:slug/improve    { section, suggestion } -> { id, status: "pending_review" }
   GET  /api/v1/practice/problems?difficulty=&topic=&company=&status=&q=&page= -> { items: Problem[], total }
   GET  /api/v1/practice/problems/:id                           -> ProblemDetail
   POST /api/v1/practice/problems/:id/run    { lang, code }     -> { verdict, cases:[{input,expected,output,pass}], runtimeMs, memoryKb }
   POST /api/v1/practice/problems/:id/submit { lang, code }     -> { verdict, passed, total, runtimeMs, memoryKb, failedCase?, scoreDelta }
   POST /api/v1/practice/execute          { lang, code, stdin } -> { stdout, stderr, exitCode, runtimeMs, memoryKb }   (IDE)
   GET  /api/v1/practice/potd                                   -> Potd
   GET  /api/v1/practice/progress                               -> Progress
   GET  /api/v1/practice/contests?status=                       -> { items: Contest[] }
   GET  /api/v1/practice/contests/:id                           -> Contest & { problems }
   GET  /api/v1/practice/contests/:id/leaderboard               -> { items: Row[], updatedAt }
   POST /api/v1/practice/contests/:id/register                  -> { registered: true }
   GET  /api/v1/practice/interview/companies                    -> { items }
   GET  /api/v1/practice/interview/quizzes/:id                  -> Quiz
   POST /api/v1/ai/hint    { problemId, code, lang, level }     -> { hint }
   POST /api/v1/ai/debug   { problemId, code, lang, failedCase } -> { explanation, suggestion }
   POST /api/v1/ai/explain { articleSlug, code, lang }          -> { explanation }
*/
(function () {
  const P = () => window.CC_PRACTICE;
  const q = new URLSearchParams(location.search);
  const STATIC = q.has("static");
  const BASE = ((window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api") + "/v1";

  async function call(path, opts = {}, ms = 8000) {
    if (STATIC) throw new Error("static");
    if (location.protocol === "file:") throw new Error("no backend on file://");
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(BASE + path, { credentials: "same-origin", ...opts, signal: ctl.signal,
        headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
      if (!r.ok) throw new Error(r.status + " " + path);
      return unwrap(await r.json());
    } finally { clearTimeout(t); }
  }
  /* BUS Q6/Q7: the backend answers { data } with an array, { rows, total } or an object. Lists become { items, total } (what
     the pages read); rows are mapped from Postgres snake_case to the page shape. Missing numbers stay null, never invented. */
  function unwrap(j) {
    const d = j && typeof j === "object" && Object.prototype.hasOwnProperty.call(j, "data") ? j.data : j;
    if (Array.isArray(d)) return { items: d, total: d.length };
    if (d && typeof d === "object" && Array.isArray(d.rows)) return { items: d.rows, total: d.total ?? d.rows.length };
    return d;
  }
  const cap = v => (typeof v === "string" && v ? v[0].toUpperCase() + v.slice(1) : v);
  const items = v => (v && Array.isArray(v.items) ? v.items : []);
  const mapProblem = x => ({ ...x, id: x.slug || x.id, difficulty: cap(x.difficulty), topic: x.topic ?? (x.tags && x.tags[0]) ?? "", companies: x.companies ?? x.company_tags ?? [],
    accuracy: x.accuracy ?? (x.attempts_count ? Math.round((x.solved_count || 0) / x.attempts_count * 100) : 0), submissions: x.submissions ?? x.attempts_count ?? 0, status: x.status ?? null });
  const contestStatus = c => { const n = Date.now(), a = Date.parse(c.start), b = Date.parse(c.end); return n < a ? "upcoming" : n < b ? "live" : "past"; };
  const mapContest = x => { const c = { ...x, id: x.slug || x.id, name: x.name ?? x.title, start: x.start ?? x.starts_at, end: x.end ?? x.ends_at,
    problems: x.problems ?? null, participants: x.participants ?? null, rated: x.rated ?? false }; return { ...c, status: x.status ?? contestStatus(c) }; };
  /* /practice/progress = { stats, by_topic, by_difficulty }; a fresh account has stats null -> the page's honest empty state */
  function mapProgress(r) {
    if (!r || r.codingScore !== undefined) return r;   // null, or already the page shape (demo)
    const st = r.stats || {}, streak = st.potd_streak ?? 0, best = st.potd_best ?? 0;
    if (!st.solved_total) return { rank: null, codingScore: st.coding_score || 0, solved: 0, attempted: null, byDifficulty: {}, byTopic: [], empty: true, streak, bestStreak: best };
    return { rank: null, codingScore: st.coding_score || 0, solved: st.solved_total, attempted: null, institute: null, streak, bestStreak: best,
      byDifficulty: Object.fromEntries(Object.entries(r.by_difficulty || {}).map(([d, n]) => [cap(d), { solved: n, total: null }])),
      byTopic: (r.by_topic || []).map(t => ({ topic: t.name || t.topic, solved: t.solved, total: t.total })) };
  }
  /* /practice/potd = { day, problems: {…} | null }; no problem published today -> null (the page says so) */
  function mapPotd(r) {
    if (!r || r.problemId) return r || null;
    const pr = Array.isArray(r.problems) ? r.problems[0] : r.problems;
    if (!pr) return null;
    return { date: r.day, problemId: pr.slug || pr.id, title: pr.title, difficulty: cap(pr.difficulty), topic: (pr.tags && pr.tags[0]) || "", endsAt: endOfTodayEAT(), streak: null, bestStreak: null, solvedToday: false };
  }
  const post = (path, body) => call(path, { method: "POST", body: JSON.stringify(body) }, 20000);
  const demoOK = () => STATIC || (/[?&]demo=1(&|$)/.test(location.search) && !!(window.CCAccess && CCAccess.can && CCAccess.can("demo.view")));
  /* empty: what a real visit gets when the backend can't answer (never the mock) */
  async function withMock(fn, mock, empty) {
    try { return await fn(); }
    catch (e) {
      if (/[?&]demo=1(&|$)/.test(location.search) && window.CCAccess && CCAccess.ready) { try { await CCAccess.ready; } catch (x) { /* empty */ } }
      if (demoOK()) return typeof mock === "function" ? mock() : mock;
      const v = typeof empty === "function" ? empty() : empty; return v === undefined ? null : v;
    }
  }
  const NONE = () => ({ items: [], total: 0, offline: true });
  const AI_OFF = "101 AI isn't reachable right now. Nothing was sent; try again in a moment.";
  const JUDGE_OFF = () => ({ verdict: "Judge not connected", offline: true, cases: [], passed: 0, total: 0, runtimeMs: 0, memoryKb: 0, failedCase: null, scoreDelta: 0,
    message: "The code judge isn't reachable right now. Nothing was run or scored." });
  const qs = o => { const s = new URLSearchParams(); Object.entries(o || {}).forEach(([k, v]) => { if (v != null && v !== "" && v !== "all") s.set(k, v); }); const t = s.toString(); return t ? "?" + t : ""; };
  const wait = ms => new Promise(r => setTimeout(r, STATIC ? 0 : ms));

  /* ---------- mock judge: a stand-in until the sandboxed runner exists ---------- */
  function mockJudge(id, lang, code, submit) {
    const d = P().problemDetail[id] || { examples: [{ input: "", output: "" }] };
    const looksDone = !/TODO/.test(code) && code.trim().length > 40;
    const cases = d.examples.map(e => ({ input: e.input, expected: e.output, output: looksDone ? e.output : "false", pass: looksDone || e.output === "false" }));
    const runtimeMs = 20 + Math.round(Math.random() * 60), memoryKb = 3200 + Math.round(Math.random() * 3000);
    if (!submit) return { verdict: cases.every(c => c.pass) ? "Sample tests passed" : "Wrong Answer", cases, runtimeMs, memoryKb, mock: true };
    const total = 42, passed = looksDone ? total : 17;
    return { verdict: looksDone ? "Accepted" : "Wrong Answer", passed, total, runtimeMs, memoryKb, mock: true, scoreDelta: looksDone ? (d.score || 2) : 0,
      failedCase: looksDone ? null : { index: 18, input: "6 9\n-3 1 2 4 5 8", expected: "true", output: "false" } };
  }

  /* mock times are written for 2026-11-02 17:30 EAT; shift them so the demo stays live/upcoming whenever it is opened */
  const rebase = c => { const sh = Date.now() - P().NOW, f = t => new Date(Date.parse(t) + sh).toISOString(); return { ...c, start: f(c.start), end: f(c.end) }; };
  const endOfTodayEAT = () => { const d = new Date(Date.now() + 3 * 36e5); d.setUTCHours(23, 59, 59, 0); return new Date(d - 3 * 36e5).toISOString(); };

  window.CC_PAPI = {
    STATIC, BASE, demoOK, _map: { unwrap, mapProblem, mapContest, mapProgress, mapPotd },
    articles: (f) => withMock(() => call("/articles" + qs(f)), () => {
      const s = (f && f.q || "").toLowerCase();
      const items = P().articles.filter(a => (!f.topic || f.topic === "all" || a.topic === f.topic) && (!f.sub || a.sub === f.sub) && (!f.level || f.level === "all" || a.level === f.level) && (!f.edu || f.edu === "all" || a.edu === f.edu) && (!s || (a.title + " " + a.desc + " " + a.sub).toLowerCase().includes(s)));
      return { items, total: items.length, mock: true };
    }, NONE),
    article: (slug) => withMock(() => call("/articles/" + encodeURIComponent(slug)), () => {
      const a = P().articles.find(x => x.slug === slug) || P().articles[0];
      const body = P().articleBody[a.slug] || { sections: [{ id: "intro", h: "Introduction", p: [a.desc, "Full article coming soon — this is placeholder content."] }] };
      return { ...a, ...body, mock: true };
    }, null),
    comments: (slug) => withMock(() => call(`/articles/${encodeURIComponent(slug)}/comments`), () => ({ items: P().comments, mock: true }), NONE),
    addComment: (slug, text) => withMock(() => post(`/articles/${encodeURIComponent(slug)}/comments`, { text }), () => ({ id: Date.now(), user: "You", av: "ME", ago: "just now", text, likes: 0, mock: true }), () => { throw new Error("Your comment wasn't posted (offline). Try again."); }),
    improve: (slug, body) => withMock(() => post(`/articles/${encodeURIComponent(slug)}/improve`, body), () => ({ id: "imp-" + Date.now(), status: "pending_review", mock: true }), { status: "offline" }),

    problems: (f) => withMock(() => call("/practice/problems" + qs(f)).then(v => ({ ...v, items: items(v).map(mapProblem) })), () => ({ items: P().problems, total: P().problems.length, mock: true }), NONE),
    problem: (id) => withMock(() => call("/practice/problems/" + encodeURIComponent(id)), () => ({ ...(P().problemDetail[id] || P().problemDetail["pair-sum-sorted"]), mock: true }), null),
    run: async (id, lang, code) => withMock(() => post(`/practice/problems/${encodeURIComponent(id)}/run`, { lang, code }), async () => { await wait(600); return mockJudge(id, lang, code, false); }, JUDGE_OFF),
    submit: async (id, lang, code) => withMock(() => post(`/practice/problems/${encodeURIComponent(id)}/submit`, { lang, code }), async () => { await wait(900); return mockJudge(id, lang, code, true); }, JUDGE_OFF),
    execute: async (lang, code, stdin) => withMock(() => post("/practice/execute", { lang, code, stdin }), async () => {
      await wait(500);
      return { stdout: "", stderr: "Code runner is not connected yet (mock). On the live site this runs in the sandboxed judge.\nstdin received: " + (stdin ? stdin.length + " bytes" : "none"), exitCode: 0, runtimeMs: 0, memoryKb: 0, mock: true };
    }, () => ({ stdout: "", stderr: "The code runner isn't reachable right now. Nothing was run.", exitCode: -1, runtimeMs: 0, memoryKb: 0, offline: true })),
    potd: () => withMock(() => call("/practice/potd").then(mapPotd), () => ({ ...P().potd, endsAt: endOfTodayEAT(), mock: true }), null),
    progress: () => withMock(() => call("/practice/progress").then(mapProgress), () => ({ ...P().progress, mock: true }), null),
    contests: (status) => withMock(() => call("/practice/contests" + qs({ when: ["upcoming", "live", "past"].includes(status) ? status : undefined })).then(v => ({ ...v, items: items(v).map(mapContest) })), () => ({ items: P().contests.map(rebase), mock: true }), NONE),
    contest: (id) => withMock(() => call("/practice/contests/" + encodeURIComponent(id)), () => ({ ...rebase(P().contests.find(c => c.id === id) || P().contests[0]), problems: P().contestProblems, mock: true }), null),
    leaderboard: (id) => withMock(() => call(`/practice/contests/${encodeURIComponent(id)}/leaderboard`), () => ({ items: P().leaderboard, updatedAt: new Date().toISOString(), mock: true }), () => ({ items: [], updatedAt: new Date().toISOString(), offline: true })),
    register: (id) => withMock(() => post(`/practice/contests/${encodeURIComponent(id)}/register`, {}), () => ({ registered: true, mock: true }), { registered: false, offline: true }),
    companies: () => withMock(() => call("/practice/interview-sets"), () => ({ items: P().interview.companies, sets: P().interview.sets, mock: true }), () => ({ items: [], sets: [], offline: true })),
    quiz: (id) => withMock(() => call("/practice/quizzes/" + encodeURIComponent(id)), () => ({ ...P().interview.quiz, mock: true }), null),

    aiHint: (body) => withMock(() => post("/ai/hint", body), () => { const d = P().problemDetail[body.problemId]; const h = d && d.hints[Math.min(body.level || 0, d.hints.length - 1)]; return { hint: h || "Think about what the constraints allow: n up to 10⁵ means O(n log n) or better.", mock: true }; }, { hint: AI_OFF, offline: true }),
    aiDebug: (body) => withMock(() => post("/ai/debug", body), () => ({ explanation: "101 AI (preview): your program prints a fixed answer and never compares arr[left] + arr[right] with x. " + (body.failedCase ? `On the failing case the expected output is "${body.failedCase.expected}".` : ""), suggestion: "Add a while (left < right) loop; move left when the sum is too small, right when it is too big.", mock: true }), { explanation: AI_OFF, suggestion: "", offline: true }),
    aiExplain: (body) => withMock(() => post("/ai/explain", body), () => ({ explanation: "101 AI (preview): this code keeps two indices. Each loop step compares their sum with the target and moves one index inward, so the whole array is scanned once — O(n) time, O(1) space.", mock: true }), { explanation: AI_OFF, offline: true })
  };
})();
