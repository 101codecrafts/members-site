/* 101 Practice & Learn — API stubs. Every call tries the backend first, then falls back to js/practice-data.js mocks.
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
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const post = (path, body) => call(path, { method: "POST", body: JSON.stringify(body) }, 20000);
  async function withMock(fn, mock) { try { return await fn(); } catch (e) { return typeof mock === "function" ? mock() : mock; } }
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
    STATIC, BASE,
    articles: (f) => withMock(() => call("/articles" + qs(f)), () => {
      const s = (f && f.q || "").toLowerCase();
      const items = P().articles.filter(a => (!f.topic || f.topic === "all" || a.topic === f.topic) && (!f.sub || a.sub === f.sub) && (!f.level || f.level === "all" || a.level === f.level) && (!f.edu || f.edu === "all" || a.edu === f.edu) && (!s || (a.title + " " + a.desc + " " + a.sub).toLowerCase().includes(s)));
      return { items, total: items.length, mock: true };
    }),
    article: (slug) => withMock(() => call("/articles/" + encodeURIComponent(slug)), () => {
      const a = P().articles.find(x => x.slug === slug) || P().articles[0];
      const body = P().articleBody[a.slug] || { sections: [{ id: "intro", h: "Introduction", p: [a.desc, "Full article coming soon — this is placeholder content."] }] };
      return { ...a, ...body, mock: true };
    }),
    comments: (slug) => withMock(() => call(`/articles/${encodeURIComponent(slug)}/comments`), () => ({ items: P().comments, mock: true })),
    addComment: (slug, text) => withMock(() => post(`/articles/${encodeURIComponent(slug)}/comments`, { text }), () => ({ id: Date.now(), user: "You", av: "ME", ago: "just now", text, likes: 0, mock: true })),
    improve: (slug, body) => withMock(() => post(`/articles/${encodeURIComponent(slug)}/improve`, body), () => ({ id: "imp-" + Date.now(), status: "pending_review", mock: true })),

    problems: (f) => withMock(() => call("/practice/problems" + qs(f)), () => ({ items: P().problems, total: P().problems.length, mock: true })),
    problem: (id) => withMock(() => call("/practice/problems/" + encodeURIComponent(id)), () => ({ ...(P().problemDetail[id] || P().problemDetail["pair-sum-sorted"]), mock: true })),
    run: async (id, lang, code) => withMock(() => post(`/practice/problems/${encodeURIComponent(id)}/run`, { lang, code }), async () => { await wait(600); return mockJudge(id, lang, code, false); }),
    submit: async (id, lang, code) => withMock(() => post(`/practice/problems/${encodeURIComponent(id)}/submit`, { lang, code }), async () => { await wait(900); return mockJudge(id, lang, code, true); }),
    execute: async (lang, code, stdin) => withMock(() => post("/practice/execute", { lang, code, stdin }), async () => {
      await wait(500);
      return { stdout: "", stderr: "Code runner is not connected yet (mock). On the live site this runs in the sandboxed judge.\nstdin received: " + (stdin ? stdin.length + " bytes" : "none"), exitCode: 0, runtimeMs: 0, memoryKb: 0, mock: true };
    }),
    potd: () => withMock(() => call("/practice/potd"), () => ({ ...P().potd, endsAt: endOfTodayEAT(), mock: true })),
    progress: () => withMock(() => call("/practice/progress"), () => ({ ...P().progress, mock: true })),
    contests: (status) => withMock(() => call("/practice/contests" + qs({ status })), () => ({ items: P().contests.map(rebase), mock: true })),
    contest: (id) => withMock(() => call("/practice/contests/" + encodeURIComponent(id)), () => ({ ...rebase(P().contests.find(c => c.id === id) || P().contests[0]), problems: P().contestProblems, mock: true })),
    leaderboard: (id) => withMock(() => call(`/practice/contests/${encodeURIComponent(id)}/leaderboard`), () => ({ items: P().leaderboard, updatedAt: new Date().toISOString(), mock: true })),
    register: (id) => withMock(() => post(`/practice/contests/${encodeURIComponent(id)}/register`, {}), () => ({ registered: true, mock: true })),
    companies: () => withMock(() => call("/practice/interview/companies"), () => ({ items: P().interview.companies, sets: P().interview.sets, mock: true })),
    quiz: (id) => withMock(() => call("/practice/interview/quizzes/" + encodeURIComponent(id)), () => ({ ...P().interview.quiz, mock: true })),

    aiHint: (body) => withMock(() => post("/ai/hint", body), () => { const d = P().problemDetail[body.problemId]; const h = d && d.hints[Math.min(body.level || 0, d.hints.length - 1)]; return { hint: h || "Think about what the constraints allow: n up to 10⁵ means O(n log n) or better.", mock: true }; }),
    aiDebug: (body) => withMock(() => post("/ai/debug", body), () => ({ explanation: "101 AI (preview): your program prints a fixed answer and never compares arr[left] + arr[right] with x. " + (body.failedCase ? `On the failing case the expected output is "${body.failedCase.expected}".` : ""), suggestion: "Add a while (left < right) loop; move left when the sum is too small, right when it is too big.", mock: true })),
    aiExplain: (body) => withMock(() => post("/ai/explain", body), () => ({ explanation: "101 AI (preview): this code keeps two indices. Each loop step compares their sum with the target and moves one index inward, so the whole array is scanned once — O(n) time, O(1) space.", mock: true }))
  };
})();
