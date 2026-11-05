/* 101 Codecrafts — every network call lives here.
   Each function tries the backend first (API_BASE + endpoint), then a free public API where one exists.
   ROUND 11 RULE: the seeded people, numbers and activity in js/data.js are NEVER shown for a real visit. A 401/403, an
   empty answer or an unreachable API gives the real empty / denied / sign-in state (null or []), never placeholders.
   Seeded data appears only in ?static=1 (design screenshots, no auth, no fetch) and for an admin with ?demo=1.
   The curated catalogue (real third-party course and resource links, no people or money) is the only offline fallback,
   and only when the API cannot be reached (never on 401/403). No keys or secrets are stored in this repo. */
(function () {
  const D = () => window.CC_DATA;
  const params = new URLSearchParams(location.search);
  const STATIC = params.has("static");
  const API_BASE = (window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api";
  const GH_ORG = "101codecrafts";

  /* Legacy front-end paths → backend /api/v1 (see backend OpenAPI). Paths with no v1 equivalent are not requested:
     they resolve to the bundled demo data, exactly as when the API is unreachable. */
  const V1_MAP = [
    [/^\/courses\/external\/unfurl$/, null], [/^\/courses\/external(\?.*)?$/, "/v1/external-courses$1"],
    [/^\/courses\/([^/?]+)\/lessons\/([^/?]+)\/complete$/, "/v1/lessons/$2/complete"],
    [/^\/courses(\/[^/?]+)?(\?.*)?$/, "/v1/courses$1$2"],
    [/^\/news\/today.*$/, "/v1/news"], [/^\/resources\/unfurl$/, "/v1/resources/unfurl"], [/^\/resources(.*)$/, "/v1/resources$1"],
    [/^\/social$/, "/v1/social"], [/^\/me\/(.*)$/, "/v1/me/$1"], [/^\/u\/(.*)$/, "/v1/portfolio/$1"],
    [/^\/certificates\/(.*)$/, "/v1/certificates/verify/$1"], [/^\/groups\/([^/]+)\/join$/, "/v1/groups/$1/join"],
    [/^\/launchpad\/today.*$/, "/v1/launchpad"],
    [/^\/admin\/(analytics|audit|moderation|payouts|users|settings)(.*)$/, "/v1/admin/$1$2"], [/^\/admin\/kpis$/, "/v1/admin/overview"],
    [/^\/tutor\/overview$/, "/v1/tutor/dashboard"], [/^\/tutor\/payouts$/, "/v1/tutor/payouts"],
    [/^\/market\/products(.*)$/, "/v1/marketplace/products$1"], [/^\/market\/categories$/, "/v1/marketplace/categories"],
    [/^\/market\/cart$/, "/v1/marketplace/cart"], [/^\/market\/checkout$/, "/v1/marketplace/checkout"],
    [/^\/market\/orders\/([^/]+)\/(confirm|dispute)$/, "/v1/marketplace/orders/$1/$2"], [/^\/market\/orders$/, "/v1/marketplace/orders"],
    [/^\/market\/rfq\/([^/]+)\/quotes$/, "/v1/marketplace/rfqs/$1/quotes"], [/^\/market\/rfq$/, "/v1/marketplace/rfqs"],
    [/^\/market\/affiliates$/, "/v1/marketplace/external"]
  ];
  function toV1(path) { if (path.startsWith("/v1/")) return path; for (const [re, to] of V1_MAP) if (re.test(path)) return to && path.replace(re, to); return null; }
  /* backend envelope is {data}; list endpoints put rows in data.items */
  const unwrap = j => { const d = j && Object.prototype.hasOwnProperty.call(j, "data") ? j.data : j; return d && Array.isArray(d.items) ? d.items : d && Array.isArray(d.rows) ? d.rows : d; };
  window.CC_V1 = { toV1, unwrap };

  /* Static hosting guard. The front-end-only Vercel project has no /api, so every call there could only 404 (and showed as
     console noise on every page). The first /api request of a visit waits for ONE probe of /api/v1/health: a 404 that is
     not JSON (the host's 404.html) means "no backend here", remembered for 6 hours in localStorage. While it holds, every
     same-origin /api request is answered locally with a JSON 404, so callers behave exactly as before but nothing hits the
     network. A JSON reply or any network error leaves the real fetch in place (the combined deploy, or an outage). */
  (function apiGuard() {
    if (STATIC || location.protocol === "file:" || !window.fetch) return;
    const base = API_BASE.replace(/\/$/, ""), KEY = "cc_api_absent", TTL = 6 * 3600e3, orig = window.fetch.bind(window);
    let absent = null, probe = null;
    try { const t = +localStorage.getItem(KEY); if (t && Date.now() - t < TTL) absent = true; } catch (e) {}
    const isApi = u => { try { const x = new URL(u, location.href); return x.origin === location.origin && x.pathname.startsWith(base + "/"); } catch (e) { return false; } };
    const fake = () => Promise.resolve(new Response('{"error":{"code":"no_backend","message":"No 101 backend on this host"}}', { status: 404, headers: { "Content-Type": "application/json" } }));
    const check = () => probe || (probe = orig(base + "/v1/health", { headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store" }).then(r => {
      absent = r.status === 404 && !/json/i.test(r.headers.get("content-type") || "");
      try { absent ? localStorage.setItem(KEY, String(Date.now())) : localStorage.removeItem(KEY); } catch (e) {}
    }, () => { absent = false; }));
    window.fetch = function (input, init) {
      const u = typeof input === "string" ? input : (input && input.url) || String(input);
      if (!isApi(u)) return orig(input, init);
      if (absent === true) return fake();
      if (absent === false) return orig(input, init);
      return check().then(() => absent ? fake() : orig(input, init));
    };
    window.CC_NO_BACKEND = () => absent === true;
  })();

  async function getJSON(url, opts = {}, ms = 6000) {
    if (STATIC) throw new Error("static mode");
    if (location.protocol === "file:" && url.startsWith("/")) throw new Error("no backend on file://");
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { Accept: "application/json", ...(opts.headers || {}) } });
      if (!r.ok) throw new Error(r.status + " " + url);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  /* when the backend is not reachable (static preview) every call falls back to bundled demo data; tell the UI once */
  function markDemo() { if (STATIC || window.CC_DEMO) return; window.CC_DEMO = true; try { dispatchEvent(new CustomEvent("cc:demo")); } catch (e) {} }
  let lastFail = 0;   // HTTP status of the most recent failed backend call (0 = unreachable / no endpoint)
  async function backend(path, opts) {
    const v1 = toV1(path); if (!v1) { lastFail = 0; throw new Error("no v1 endpoint for " + path); }   // never requested: real empty state
    try { return unwrap(await getJSON(API_BASE + v1, { credentials: "include", ...(opts || {}) })); }
    catch (e) { const m = /^(\d{3}) /.exec(e.message); lastFail = m ? +m[1] : 0; if (!/^(401|403|404|409|422) /.test(e.message)) markDemo(); throw e; }
  }
  async function tryChain(...fns) { for (const f of fns) { try { const v = await f(); if (v != null) return v; } catch (e) { /* next */ } } return null; }
  /* round 11: seeded js/data.js only for ?static=1 or an admin's explicit ?demo=1 (server-confirmed role via CCAccess). */
  const demoOK = () => STATIC || (/[?&]demo=1(&|$)/.test(location.search) && !!(window.CCAccess && CCAccess.can && CCAccess.can("demo.view")));
  const seeded = (v, demo, empty) => v != null ? v : (demoOK() ? demo() : empty);
  /* curated catalogue: offline fallback only when the API is unreachable; a 401/403 shows the real (empty) answer */
  const curated = (v, cat) => v != null ? v : (demoOK() || !(lastFail === 401 || lastFail === 403) ? cat() : []);
  const lastStatus = () => lastFail;

  /* ---------- link-out helper: every external resource opens through /go/<id> ---------- */
  function goHref(id) {
    // On a server (Vercel/Next.js) /go/<id> redirects (see vercel.json + go.html). On file:// use go.html?id=.
    return location.protocol === "file:" ? "go.html?id=" + encodeURIComponent(id) : "/go/" + encodeURIComponent(id);
  }
  function lookupGo(id) {
    const all = [...(D().resources || []), ...(D().externalCourses || []), ...(D().providerLinks || []), ...(D().aiTools || []).flatMap(t => [{ id: "ai-" + t.id, url: t.keyUrl }, { id: "ai-" + t.id + "-docs", url: t.docsUrl }]), ...(JSON.parse(localStorage.getItem("cc_ext_drafts") || "[]")), ...(D().news || []), ...((D().course && D().course.books) || []), ...(window.__ccNewsCache || []), ...(window.CC_FEED_GO ? window.CC_FEED_GO() : [])];
    return all.find(x => x.id === id) || null;
  }

  /* ---------- GitHub REST API (public, unauthenticated: 60 req/h per IP) ---------- */
  async function fetchRepoStats(repo) {
    const cacheKey = "gh:" + repo; const c = sessionStorage.getItem(cacheKey);
    if (c) return JSON.parse(c);
    const j = await getJSON(`https://api.github.com/repos/${GH_ORG}/${repo}`);
    const v = { stars: j.stargazers_count, forks: j.forks_count, url: j.html_url };
    sessionStorage.setItem(cacheKey, JSON.stringify(v)); return v;
  }

  /* ---------- News: backend → Hacker News + Dev.to (public, no key) → placeholders ---------- */
  const CAT_RULES = [
    ["AI", /\b(ai|llm|gpt|model|machine learning|neural|openai|anthropic|gemini)\b/i],
    ["Africa Tech", /\b(africa|uganda|kenya|nigeria|kampala|nairobi|lagos|m-?pesa|mobile money)\b/i],
    ["Security", /\b(security|vuln|cve|exploit|breach|hack|malware|ransomware|phishing)\b/i],
    ["Cloud", /\b(cloud|aws|azure|gcp|kubernetes|k8s|docker|serverless|devops)\b/i],
    ["Startups", /\b(startup|founder|funding|raise|yc|seed|series [abc]|vc)\b/i],
    ["Jobs", /\b(hiring|jobs?|career|intern|remote role)\b/i]
  ];
  const catOf = t => (CAT_RULES.find(([, re]) => re.test(t)) || ["Dev"])[0];
  const agoOf = s => { const m = Math.max(1, Math.round((Date.now() / 1000 - s) / 60)); return m < 60 ? m + "m" : Math.round(m / 60) + "h"; };
  async function fromHN() {
    const ids = await getJSON("https://hacker-news.firebaseio.com/v0/topstories.json");
    const items = await Promise.all(ids.slice(0, 18).map(id => getJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)));
    return items.filter(x => x && x.url).map(x => ({ id: "hn-" + x.id, cat: catOf(x.title), title: x.title, source: new URL(x.url).hostname.replace(/^www\./, ""), url: x.url, ago: agoOf(x.time), summary: `${x.score} points · ${x.descendants || 0} comments on Hacker News` }));
  }
  async function fromDevto() {
    const arr = await getJSON("https://dev.to/api/articles?top=1&per_page=12");
    return arr.map(a => ({ id: "dev-" + a.id, cat: catOf(a.title + " " + (a.tag_list || []).join(" ")), title: a.title, source: "Dev.to", url: a.url, image: a.cover_image || a.social_image, ago: agoOf(Date.parse(a.published_at) / 1000), summary: a.description }));
  }
  async function fetchNews() {
    const v = await tryChain(() => backend("/news/today"), async () => {
      const [hn, dv] = await Promise.allSettled([fromHN(), fromDevto()]);
      const out = [...(dv.value || []), ...(hn.value || [])];
      return out.length ? out : null;
    });
    const news = seeded(v, () => D().news, []); window.__ccNewsCache = news; return news;
  }

  /* ---------- Library ---------- */
  async function fetchResources(q = {}) { return curated(await tryChain(() => backend("/resources?" + new URLSearchParams(q))), () => D().resources); }
  /** Paste-a-link preview. Backend: POST /api/resources/unfurl {url} → {title, desc, thumb, site, favicon, type} */
  async function fetchUnfurl(url) {
    const v = await tryChain(() => backend("/resources/unfurl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }));
    if (v) return v;
    const u = new URL(url); const host = u.hostname.replace(/^www\./, "");
    const type = /youtube|youtu\.be|vimeo/.test(host) ? "Video" : /github|gitlab/.test(host) ? "Repo" : /openlibrary|books\.google|oreilly/.test(host) ? "Book" : /coursera|edx|udemy|freecodecamp|kaggle|netacad/.test(host) ? "Course" : "Article";
    const yt = u.searchParams.get("v");
    return { title: decodeURIComponent((u.pathname.split("/").filter(Boolean).pop() || host).replace(/[-_]/g, " ")), desc: "Preview generated in the browser — the backend unfurl adds the real title and description.", thumb: yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : "", site: host, favicon: `https://${host}/favicon.ico`, type, url, tags: [] };
  }
  async function publishResource(card) { return tryChain(() => backend("/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) })); }


  /* ---------- Courses catalog ---------- */
  /** GET /api/courses → 101 courses taught on the platform [{id,title,tutor,level,category,rating,reviews,price,lessons,cover}] */
  const fetchCourses101 = async () => seeded(await tryChain(() => backend("/courses")), () => D().courses101, []);
  /** GET /api/courses/external → [{id,provider,title,url,level,category,access,free_until?,free_until_status?,certFree,aid?,desc}] */
  const fetchExternalCourses = async () => curated(await tryChain(() => backend("/courses/external")), () => D().externalCourses);
  /** Paste-a-link preview for an external course. Backend: POST /api/courses/external/unfurl {url} → {title, desc, provider, ...}.
      Stub: reuses the generic unfurl and guesses the provider from the hostname. */
  const PROVIDER_HOSTS = [["coursera", /coursera\.org$/], ["edx", /edx\.org$/], ["freecodecamp", /freecodecamp\.org$/], ["google", /(google\.com|grow\.google|withgoogle\.com)$/], ["microsoft", /microsoft\.com$/], ["cisco", /netacad\.com$/], ["khan", /khanacademy\.org$/], ["alison", /alison\.com$/]];
  async function unfurlExternalCourse(url) {
    const v = await tryChain(() => backend("/courses/external/unfurl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }));
    if (v) return v;
    const base = await fetchUnfurl(url); const host = new URL(url).hostname.replace(/^www\./, "");
    const provider = (PROVIDER_HOSTS.find(([, re]) => re.test(host)) || ["other"])[0];
    return { ...base, provider, title: base.title.replace(/\b\w/g, c => c.toUpperCase()), access: "Free", certFree: false, level: "University", category: "Computer Science" };
  }
  /** POST /api/courses/external (tutor/admin; goes to admin review). Fallback keeps a local draft so go.html can resolve it. */
  async function addExternalCourse(course) {
    const r = await tryChain(() => backend("/courses/external", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(course) }));
    if (!r) { const k = "cc_ext_drafts"; const a = JSON.parse(localStorage.getItem(k) || "[]"); a.push(course); localStorage.setItem(k, JSON.stringify(a)); }
    return r;
  }


  /* ---------- AI tools: bring-your-own-key playground ----------
     The learner's OWN key is used only in this browser: kept in sessionStorage (cleared when the tab closes) and sent
     straight to the provider's official endpoint below. It is never sent to API_BASE / our servers, never logged. */
  const BYOK = {
    openrouter: { label: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", model: "meta-llama/llama-3.3-70b-instruct:free" },
    groq: { label: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.1-8b-instant" },
    huggingface: { label: "Hugging Face", url: "https://router.huggingface.co/v1/chat/completions", model: "meta-llama/Llama-3.1-8B-Instruct" }
  };
  const byokKey = { get: p => sessionStorage.getItem("cc_byok_" + p) || "", set: (p, k) => sessionStorage.setItem("cc_byok_" + p, k), clear: p => sessionStorage.removeItem("cc_byok_" + p) };
  async function byokChat(provider, key, model, prompt) {
    const P = BYOK[provider]; if (!P) throw new Error("Unknown provider");
    if (STATIC) throw new Error("static mode");
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(P.url, { method: "POST", signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, ...(provider === "openrouter" ? { "X-Title": "101 Codecrafts playground" } : {}) },
        body: JSON.stringify({ model: model || P.model, messages: [{ role: "user", content: prompt }], max_tokens: 400 }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || ("HTTP " + r.status));
      return { text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "(empty reply)", model: j.model || model || P.model, usage: j.usage || null };
    } finally { clearTimeout(t); }
  }

  /* ---------- Admin ---------- */
  const A = () => D().admin;
  const fetchAdminKpis = async () => seeded(await tryChain(() => backend("/admin/kpis")), () => A().kpis, null);
  const fetchAnalytics = async () => seeded(await tryChain(() => backend("/admin/analytics")), () => ({ signups: A().signups, revenue: A().revenue, enrolments: A().enrolments, completion: A().completion, funnel: A().funnel }), null);
  const fetchUsers = async (role = "") => { const v = await tryChain(() => backend("/admin/users?role=" + role)); const all = seeded(v, () => A().users, []); return role ? all.filter(u => u.role === role) : all; };
  const fetchPendingMembers = async () => seeded(await tryChain(() => backend("/admin/approvals/members")), () => A().pendingMembers, null);
  const fetchRecentSignups = async () => seeded(await tryChain(() => backend("/admin/signups/recent")), () => A().recentSignups, null);
  const fetchCourseApprovals = async () => seeded(await tryChain(() => backend("/admin/approvals/courses")), () => A().courseApprovals, null);
  const fetchPayouts = async () => seeded(await tryChain(() => backend("/admin/payouts?status=pending")), () => A().payouts, null);
  const fetchTransactions = async () => seeded(await tryChain(() => backend("/admin/transactions")), () => A().transactions, null);
  const fetchModerationQueue = async () => seeded(await tryChain(() => backend("/admin/moderation")), () => A().moderation, null);
  const fetchEventsAdmin = async () => seeded(await tryChain(() => backend("/admin/events")), () => A().events, null);
  const fetchAuditLog = async () => seeded(await tryChain(() => backend("/admin/audit")), () => A().audit, null);
  const fetchFlags = async () => seeded(await tryChain(() => backend("/admin/flags")), () => A().flags, null);
  const post = (path, body) => tryChain(() => backend(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }));
  const adminAction = {
    approveMember: id => post(`/admin/approvals/members/${id}/approve`), rejectMember: id => post(`/admin/approvals/members/${id}/reject`),
    suspendUser: id => post(`/admin/users/${id}/suspend`), changeRole: (id, role) => post(`/admin/users/${id}/role`, { role }), verifyTutor: id => post(`/admin/tutors/${id}/verify`),
    approveCourse: id => post(`/admin/courses/${id}/approve`), rejectCourse: id => post(`/admin/courses/${id}/reject`),
    approvePayout: id => post(`/admin/payouts/${id}/approve`), holdPayout: id => post(`/admin/payouts/${id}/hold`),
    refund: id => post(`/admin/transactions/${id}/refund`), moderate: (id, action) => post(`/admin/moderation/${id}`, { action }),
    setFlag: (key, on) => post(`/admin/flags/${key}`, { on }), setCommission: pct => post(`/admin/settings/commission`, { pct }),
    broadcast: msg => post(`/admin/announcements`, msg)
  };

  /* ---------- Tutor ---------- */
  /* real data only (round 11): null when the API can't answer, never demo numbers. Dashboards use js/dash-common.js. */
  const fetchTutorOverview = async () => tryChain(() => backend("/tutor/overview"));
  const requestPayout = (amount, method) => post("/tutor/payouts", { amount, method });

  /* ---------- Payments (round 11): the browser NEVER names an amount (SR-17) ----------
     Every checkout is priced by the server (POST /api/v1/checkout, /api/v1/billing/checkout, /api/v1/marketplace/checkout)
     which returns the provider's hosted checkout URL. This helper only opens that server-issued URL (sandbox in this build). */
  function flutterwaveCheckout(opts) {
    const url = opts && opts.checkoutUrl;
    if (url && /^https:\/\//.test(url)) { location.href = url; return true; }
    console.warn("[101] Payments open only from a server-issued checkout URL; client amounts are never sent (SR-17).");
    return false;
  }

  /* ---------- Launchpad / testing / competitions / groups / projects ---------- */
  const lvl = (arr, level) => level ? arr.filter(x => x.level === level) : arr;
  const fetchProducts = async (level = "") => lvl(seeded(await tryChain(() => backend("/launchpad/today?level=" + level)), () => D().products, []), level).slice().sort((a, b) => b.votes - a.votes);
  const fetchProduct = async id => seeded(await tryChain(() => backend("/launchpad/" + id)), () => ({ ...(D().products.find(p => p.id === id) || D().products[0]), changelog: D().changelog, comments: D().productComments }), null);
  const upvoteProduct = id => post(`/launchpad/${id}/upvote`);
  const commentProduct = (id, text) => post(`/launchpad/${id}/comments`, { text });
  const fetchCampaigns = async (level = "") => lvl(seeded(await tryChain(() => backend("/testing/campaigns")), () => D().campaigns, []), level);
  const joinCampaign = id => post(`/testing/campaigns/${id}/join`);
  const becomeTester = profile => post("/testing/testers", profile);
  /** multipart: fields + optional screenshot file → POST /api/testing/reports */
  async function submitBugReport(formData) { return tryChain(() => getJSON(API_BASE + "/testing/reports", { method: "POST", body: formData })); }
  const fetchTriage = async () => seeded(await tryChain(() => backend("/testing/triage")), () => D().triage, {});
  const moveBug = (id, column) => post(`/testing/reports/${id}/move`, { column });
  const fetchCompetitions = async (level = "", track = "") => { const all = seeded(await tryChain(() => backend("/competitions")), () => D().competitions, []); return lvl(all, level).filter(c => !track || c.track === track); };
  const registerCompetition = (id, entry) => post(`/competitions/${id}/register`, entry);
  const submitEntry = (id, entry) => post(`/competitions/${id}/submissions`, entry);
  const fetchLeaderboard = async id => seeded(await tryChain(() => backend(`/competitions/${id}/leaderboard`)), () => D().leaderboard, []);
  const fetchGroups = async (level = "", kind = "") => lvl(seeded(await tryChain(() => backend("/groups")), () => D().groups, []), level).filter(g => !kind || g.kind === kind);
  const fetchGroup = async id => seeded(await tryChain(() => backend("/groups/" + id)), () => ({ ...(D().groups.find(g => g.id === id) || D().groups[0]), feed: D().groupFeed, projects: D().projects.slice(0, 2) }), null);
  const joinGroup = id => post(`/groups/${id}/join`);
  const fetchProjects = async () => seeded(await tryChain(() => backend("/projects?mine=1")), () => D().projects, []);
  const toggleMilestone = (pid, i, done) => post(`/projects/${pid}/milestones/${i}`, { done });
  const promoteToLaunchpad = pid => post(`/projects/${pid}/promote`);

  /* ---------- Course player ---------- */
  const fetchCourse = async id => seeded(await tryChain(() => backend("/courses/" + id)), () => D().course, null);
  const markLessonComplete = (courseId, lessonId, done = true) => { const k = "cc_done_" + courseId; const s = new Set(JSON.parse(localStorage.getItem(k) || "[]")); done ? s.add(lessonId) : s.delete(lessonId); localStorage.setItem(k, JSON.stringify([...s])); return post(`/courses/${courseId}/lessons/${lessonId}/complete`, { done }); };
  const saveNotes = (courseId, lessonId, text) => { localStorage.setItem(`cc_notes_${courseId}_${lessonId}`, text); return post(`/courses/${courseId}/lessons/${lessonId}/notes`, { text }); };
  const postDiscussion = (courseId, text) => post(`/courses/${courseId}/discussion`, { text });
  /** YouTube preview via the public oEmbed endpoint (no key). Thumbnail from i.ytimg.com. */
  function youtubeId(url) { try { const u = new URL(url); if (u.hostname === "youtu.be") return u.pathname.slice(1); if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2]; return u.searchParams.get("v"); } catch (e) { return /^[\w-]{11}$/.test(url) ? url : null; } }
  async function fetchYouTubePreview(url) {
    const id = youtubeId(url); if (!id) return null;
    const meta = await tryChain(() => getJSON("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id)));
    return { id, title: meta ? meta.title : "YouTube video " + id, author: meta ? meta.author_name : "", thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }
  /** Book preview via Open Library (public, no key): ISBN or search text. */
  async function fetchBookPreview(q) {
    const isbn = q.replace(/[^0-9X]/gi, "");
    if (isbn.length === 10 || isbn.length === 13) { const j = await tryChain(() => getJSON(`https://openlibrary.org/isbn/${isbn}.json`)); if (j) return { title: j.title, author: "", cover: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`, url: `https://openlibrary.org/isbn/${isbn}`, site: "Open Library" }; }
    const r = await tryChain(() => getJSON("https://openlibrary.org/search.json?limit=1&q=" + encodeURIComponent(q)));
    const d = r && r.docs && r.docs[0]; if (!d) return null;
    return { title: d.title, author: (d.author_name || [])[0] || "", cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : "", url: "https://openlibrary.org" + d.key, site: "Open Library" };
  }
  const addLessonVideo = (courseId, lesson) => post(`/tutor/courses/${courseId}/lessons`, lesson);
  const addCourseBook = (courseId, book) => post(`/tutor/courses/${courseId}/books`, book);

  /* ---------- Auth, onboarding, profile, certificates ---------- */
  /* round 11: sign-in and sign-up happen only on /auth.html (Clerk email code / Google). The old custom forms are gone, so
     these never simulate an account; they resolve null. */
  const signIn = async () => null;
  const signUp = async () => null;
  /* round 11: onboarding answers are a DRAFT (PUT /v1/auth/onboarding/draft); the role is granted only by the server when
     /auth.html completes a path (POST /v1/auth/onboarding, strict schema: any role/plan key is a 400). */
  const saveOnboarding = data => { const { role, roles, plan, ...rest } = data || {}; return tryChain(() => backend("/v1/auth/onboarding/draft", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rest) })); };
  /** Guardian consent for under-18 sign-ups (Uganda DPPA 2019 s.8: personal data of a child needs a parent/guardian's consent). */
  const requestGuardianConsent = data => tryChain(() => backend("/me/guardian", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) }));   // real route: PUT /v1/me/guardian
  const fetchProfile = async handle => seeded(await tryChain(() => backend("/u/" + handle)), () => ({ handle, name: "Sample Member", role: "Learner", level: "University", bio: "Demo profile (admin ?demo=1).", badges: [], projects: D().projects.slice(0, 2) }), null);
  /* round 11: the verifier trusts the API only. No hard-coded "valid" certificate; when the API can't answer we say so. */
  const verifyCertificate = async code => {
    if (!/^101-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return { valid: false, malformed: true };
    const r = await tryChain(() => backend("/certificates/" + encodeURIComponent(code)));
    if (r) return r;
    return lastFail === 404 ? { valid: false } : { valid: false, unavailable: true };
  };

  /* ---------- Social links ---------- */
  /** GET /api/social → [{key,label,icon,url,active}] in display order. Fallback = mockup icons with '#'. */
  async function fetchSocialLinks() { return (await tryChain(() => backend("/social"))) || null; }
  async function saveSocialLinks(list) { localStorage.setItem("cc_social_draft", JSON.stringify(list)); return tryChain(() => backend("/social", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list) })); }

  /* ---------- CSV export (client-side) ---------- */
  function toCSV(rows) {
    if (!rows.length) return ""; const cols = Object.keys(rows[0]);
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
  }
  function downloadCSV(name, rows) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv" })); a.download = name; a.click(); }

  window.CC_API = { STATIC, goHref, lookupGo, fetchRepoStats, fetchNews, fetchResources, fetchUnfurl, publishResource, fetchCourses101, fetchExternalCourses, unfurlExternalCourse, addExternalCourse, BYOK, byokKey, byokChat,
    fetchAdminKpis, fetchAnalytics, fetchUsers, fetchPendingMembers, fetchRecentSignups, fetchCourseApprovals, fetchPayouts, fetchTransactions,
    fetchModerationQueue, fetchEventsAdmin, fetchAuditLog, fetchFlags, adminAction, fetchTutorOverview, requestPayout, flutterwaveCheckout, downloadCSV, fetchSocialLinks, saveSocialLinks,
    fetchProducts, fetchProduct, upvoteProduct, commentProduct, fetchCampaigns, joinCampaign, becomeTester, submitBugReport, fetchTriage, moveBug,
    fetchCompetitions, registerCompetition, submitEntry, fetchLeaderboard, fetchGroups, fetchGroup, joinGroup, fetchProjects, toggleMilestone, promoteToLaunchpad,
    fetchCourse, markLessonComplete, saveNotes, postDiscussion, youtubeId, fetchYouTubePreview, fetchBookPreview, addLessonVideo, addCourseBook,
    signIn, signUp, saveOnboarding, requestGuardianConsent, fetchProfile, verifyCertificate, demoOK, lastStatus };
})();
