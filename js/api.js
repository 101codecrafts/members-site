/* 101 Codecrafts — every network call lives here.
   Each function tries the backend first (API_BASE + endpoint), then a free public API where one exists,
   then falls back to the placeholders in js/data.js. No keys or secrets are stored in this repo.
   In ?static=1 mode (used for the mockup screenshots) nothing is fetched and placeholders are returned. */
(function () {
  const D = () => window.CC_DATA;
  const params = new URLSearchParams(location.search);
  const STATIC = params.has("static");
  const API_BASE = (window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api";
  const GH_ORG = "101codecrafts";

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
  async function backend(path, opts) { return getJSON(API_BASE + path, opts); }
  async function tryChain(...fns) { for (const f of fns) { try { const v = await f(); if (v != null) return v; } catch (e) { /* next */ } } return null; }

  /* ---------- link-out helper: every external resource opens through /go/<id> ---------- */
  function goHref(id) {
    // On a server (Vercel/Next.js) /go/<id> redirects (see vercel.json + go.html). On file:// use go.html?id=.
    return location.protocol === "file:" ? "go.html?id=" + encodeURIComponent(id) : "/go/" + encodeURIComponent(id);
  }
  function lookupGo(id) {
    const all = [...(D().resources || []), ...(D().news || []), ...(window.__ccNewsCache || [])];
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
    const news = v || D().news; window.__ccNewsCache = news; return news;
  }

  /* ---------- Library ---------- */
  async function fetchResources(q = {}) { return (await tryChain(() => backend("/resources?" + new URLSearchParams(q)))) || D().resources; }
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

  /* ---------- Admin ---------- */
  const A = () => D().admin;
  const fetchAdminKpis = async () => (await tryChain(() => backend("/admin/kpis"))) || A().kpis;
  const fetchAnalytics = async () => (await tryChain(() => backend("/admin/analytics"))) || { signups: A().signups, revenue: A().revenue, enrolments: A().enrolments, completion: A().completion, funnel: A().funnel };
  const fetchUsers = async (role = "") => { const v = await tryChain(() => backend("/admin/users?role=" + role)); const all = v || A().users; return role ? all.filter(u => u.role === role) : all; };
  const fetchPendingMembers = async () => (await tryChain(() => backend("/admin/approvals/members"))) || A().pendingMembers;
  const fetchRecentSignups = async () => (await tryChain(() => backend("/admin/signups/recent"))) || A().recentSignups;
  const fetchCourseApprovals = async () => (await tryChain(() => backend("/admin/approvals/courses"))) || A().courseApprovals;
  const fetchPayouts = async () => (await tryChain(() => backend("/admin/payouts?status=pending"))) || A().payouts;
  const fetchTransactions = async () => (await tryChain(() => backend("/admin/transactions"))) || A().transactions;
  const fetchModerationQueue = async () => (await tryChain(() => backend("/admin/moderation"))) || A().moderation;
  const fetchEventsAdmin = async () => (await tryChain(() => backend("/admin/events"))) || A().events;
  const fetchAuditLog = async () => (await tryChain(() => backend("/admin/audit"))) || A().audit;
  const fetchFlags = async () => (await tryChain(() => backend("/admin/flags"))) || A().flags;
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
  const T = () => D().tutor;
  const fetchTutorOverview = async () => (await tryChain(() => backend("/tutor/overview"))) || T();
  const requestPayout = (amount, method) => post("/tutor/payouts", { amount, method });

  /* ---------- Payments: Flutterwave Inline (test mode stub) ----------
     Loads https://checkout.flutterwave.com/v3.js on demand. The PUBLIC key comes from CC_CONFIG.flwPublicKey
     (set it at deploy time; never commit secret keys). Without a key the call only logs what it would do. */
  function flutterwaveCheckout({ amount, currency = "UGX", email, name, title, txRef }) {
    const key = window.CC_CONFIG && window.CC_CONFIG.flwPublicKey;
    if (!key) { alert(`Flutterwave test checkout (stub)\n${title}: ${currency} ${amount.toLocaleString()}\nSet CC_CONFIG.flwPublicKey (FLWPUBK_TEST-…) to open the real test modal.`); return; }
    const run = () => window.FlutterwaveCheckout({ public_key: key, tx_ref: txRef || "cc-" + Date.now(), amount, currency, payment_options: "mobilemoneyuganda,card", customer: { email, name }, customizations: { title: "101 Codecrafts", description: title } });
    if (window.FlutterwaveCheckout) return run();
    const s = document.createElement("script"); s.src = "https://checkout.flutterwave.com/v3.js"; s.onload = run; document.head.appendChild(s);
  }

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

  window.CC_API = { STATIC, goHref, lookupGo, fetchRepoStats, fetchNews, fetchResources, fetchUnfurl, publishResource,
    fetchAdminKpis, fetchAnalytics, fetchUsers, fetchPendingMembers, fetchRecentSignups, fetchCourseApprovals, fetchPayouts, fetchTransactions,
    fetchModerationQueue, fetchEventsAdmin, fetchAuditLog, fetchFlags, adminAction, fetchTutorOverview, requestPayout, flutterwaveCheckout, downloadCSV, fetchSocialLinks, saveSocialLinks };
})();
