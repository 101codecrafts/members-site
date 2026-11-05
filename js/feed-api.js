/* 101 Codecrafts — API stubs for Announcements, Daily Tech News and Opportunities.
   Backend contract (all JSON, under API_BASE = window.CC_CONFIG.apiBase || "/api"):
     GET  /v1/announcements?role=&level=&group=          → [{id,title,body,audience:{roles,levels,groups},pinned,publishedAt,expiresAt,author,email,link?}]
     POST /v1/announcements                              ← {title,body,audience,pinned,publishAt,expiresAt,email}   (admin)
     POST /v1/announcements/:id/read                     (marks read for the signed-in member)
     GET  /v1/news?date=YYYY-MM-DD&tab=all|africa|ai|dev|startups → [{id,tab,title,source,url,at,summary}]
     POST /v1/news/:id/explain                           → {explanation}   ("Explain with 101 AI")
     GET  /v1/opportunities?type=&level=&remote=&soon=   → [{id,type,title,org,url,deadline,level,location,remote,eligibility,value}]
     POST /v1/opportunities                              ← submission; status "pending" until an admin approves it
     POST /v1/opportunities/:id/remind                   ← {days_before}
     GET  /v1/events?region=&type=&org=&from=&to=&free=   → [{id,org,type,title,start,end,region,venue,lat,lng,price,currency,going,capacity?,host101?,url,desc}]
     POST /v1/events/:id/going                           ← {going:boolean}
     POST /v1/events/:id/rsvp                            ← {name,email,phone?,level?}  → {ticket:{code,eventId,name}}  (101-hosted only)
     GET  /v1/events/:id/attendees                       → organiser view;  POST /v1/events/:id/checkin ← {code}
     POST /v1/events                                     ← submission; status "pending" until an admin approves it
     POST /v1/saved                                      ← {kind:"news"|"opportunity", id, saved:boolean}
   Round 11: js/feed-data.js / js/events-data.js placeholders (and the localStorage "offline preview" saves) appear ONLY for
   ?static=1 or an admin's ?demo=1. A real visit gets the backend's answer, real public news (HN / Dev.to via js/api.js), or an
   honest empty state; a write that can't reach the server says it was not sent (no fake success, tickets or attendees). */
(function () {
  const D = () => window.CC_FEED_DATA;
  const STATIC = new URLSearchParams(location.search).has("static");
  const BASE = ((window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api") + "/v1";
  const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };

  async function call(path, opts = {}, ms = 6000) {
    if (STATIC || location.protocol === "file:") throw new Error("no backend");
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(BASE + path, { ...opts, credentials: "include", signal: ctl.signal, headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
      if (!r.ok) throw new Error(r.status + " " + path); return unwrap(await r.json());
    } finally { clearTimeout(t); }
  }
  /* Backend envelope (BUS Q1): { data } where data is an array, { rows, total } or { items }. Unwrap in ONE place so callers
     always get the payload (an array for lists). Rows are snake_case from Postgres; the map* helpers below give the
     page code its camelCase shape (bundled preview data is already camelCase and passes through unchanged). */
  function unwrap(j) {
    const d = j && typeof j === "object" && Object.prototype.hasOwnProperty.call(j, "data") ? j.data : j;
    return d && !Array.isArray(d) && typeof d === "object" ? (Array.isArray(d.rows) ? d.rows : Array.isArray(d.items) ? d.items : d) : d;
  }
  const list = v => (Array.isArray(v) ? v : []);
  const NEWS_TAB = { ai: "ai", africa_tech: "africa", startups_funding: "startups" };   // everything else shows under Dev
  const NEWS_CAT = { ai: "ai", africa: "africa_tech", startups: "startups_funding", dev: "dev" };
  const mapAnn = a => ({ ...a, pinned: a.pinned ?? !!a.is_pinned, publishedAt: a.publishedAt ?? a.published_at ?? null, expiresAt: a.expiresAt ?? a.expires_at ?? null });
  const mapNews = n => ({ ...n, tab: n.tab ?? NEWS_TAB[n.category] ?? "dev", at: n.at ?? n.published_at ?? null, summary: n.summary ?? n.ai_summary ?? "" });
  const mapOpp = o => ({ ...o, deadline: o.deadline ?? o.deadline_at ?? null, level: o.level ?? (Array.isArray(o.levels) ? o.levels.join(", ") : o.levels ?? "") });
  const mapEvent = e => ({ ...e, start: e.start ?? e.starts_at, end: e.end ?? e.ends_at ?? e.starts_at, venue: e.venue ?? e.location ?? (e.is_online ? "Online" : ""),
    region: e.region ?? (e.is_online ? "online" : e.city ? String(e.city).toLowerCase() : null), desc: e.desc ?? e.description ?? "",
    price: e.price ?? e.price_ugx ?? 0, currency: e.currency ?? "UGX", going: e.going ?? e.registrations_count ?? 0, url: e.url ?? e.cal_com_url ?? null,
    org: e.org ?? "community", type: e.type ?? e.mode ?? null, host101: e.host101 ?? !e.cal_com_url, organiser: e.organiser === true });
  const post = (p, body) => call(p, { method: "POST", body: JSON.stringify(body) });
  const DEMO_URL = /[?&]demo=1(&|$)/.test(location.search);
  const demoOK = () => STATIC || (DEMO_URL && !!(window.CCAccess && CCAccess.can && CCAccess.can("demo.view")));
  const settle = async () => { if (DEMO_URL && window.CCAccess && CCAccess.ready) { try { await CCAccess.ready; } catch (e) { /* stays real */ } } return demoOK(); };
  const NOT_SENT = { offline: true, notSent: true, message: "Not sent: the server can't be reached right now. Nothing was saved; try again." };
  const soft = p => p.catch(() => ({ ok: true, offline: true }));

  /* ---------- Announcements ---------- */
  async function fetchAnnouncements(q = {}) {
    let rows; try { rows = list(await call("/announcements?" + new URLSearchParams(q))); } catch (e) { rows = (await settle()) ? [...ls.get("cc_ann_local", []), ...D().announcements] : []; }
    const now = Date.now();
    return rows.map(mapAnn).filter(a => (!a.expiresAt || Date.parse(a.expiresAt) > now) && (!a.publishedAt || Date.parse(a.publishedAt) <= now))
      .sort((a, b) => (b.pinned - a.pinned) || (Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
  }
  async function postAnnouncement(a) {
    try { return await post("/announcements", a); }
    catch (e) { if (!(await settle())) return { ...NOT_SENT }; const local = ls.get("cc_ann_local", []); const item = { id: "al" + Date.now(), author: "Admin", ...a, publishedAt: a.publishAt || new Date().toISOString(), _local: true }; local.unshift(item); ls.set("cc_ann_local", local); return { ...item, offline: true }; }
  }
  const readSet = () => new Set(ls.get("cc_ann_read", []));
  function markRead(ids) { const s = readSet(); ids.forEach(i => s.add(i)); ls.set("cc_ann_read", [...s]); ids.forEach(i => soft(post(`/announcements/${encodeURIComponent(i)}/read`, {}))); }

  /* ---------- News ---------- */
  const TAB_OF = { "Africa Tech": "africa", AI: "ai", Startups: "startups" };
  async function fetchNews(tab = "all") {
    try { const v = list(await call("/news" + (NEWS_CAT[tab] ? "?" + new URLSearchParams({ category: NEWS_CAT[tab] }) : ""))); if (v.length) { const items = v.map(mapNews); window.__ccFeedNews = items; return items; } } catch (e) { /* fall through */ }
    let items = (await settle()) ? D().news.slice() : [];
    /* live fallback: the existing HN + Dev.to fetch in js/api.js, mapped onto our tabs, after the curated items */
    if (!STATIC && window.CC_API && window.CC_API.fetchNews) {
      try { const live = await window.CC_API.fetchNews(); if (Array.isArray(live) && live !== (window.CC_DATA || {}).news) items = items.concat(live.slice(0, 12).map(n => ({ id: n.id, tab: TAB_OF[n.cat] || "dev", title: n.title, source: n.source, url: n.url, at: null, ago: n.ago, summary: n.summary }))); } catch (e) { /* placeholders only */ }
    }
    window.__ccFeedNews = items; return items;
  }
  /* Round 12: the explain call gets its own fetch (an LLM answer can take 10-40 s; call()'s 6 s abort made every
     explain look "unreachable") and maps each failure to an honest message instead of one catch-all. */
  const AI_UNAVAILABLE = "101 AI can't answer right now. Try again in a minute.";
  async function explainNews(n) {
    if (!STATIC && location.protocol !== "file:") {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 50000);
      try {
        const r = await fetch(`${BASE}/news/${encodeURIComponent(n.id)}/explain`, { method: "POST", credentials: "include", signal: ctl.signal, headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ title: n.title, url: n.url }) });
        let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ }
        if (r.ok && j && (j.explanation || (j.data && j.data.explanation))) return j.explanation ? j : j.data;
        const err = (j && j.error) || {}, code = typeof err === "string" ? err : err.code, msg = typeof err === "string" ? "" : err.message;
        /* round 12 QA: the "free AI allowance" copy only for the server's machine code ai_quota (no retry until the reset) */
        if (code === "ai_quota") return { offline: true, quota: true, retry: false, resetsAt: err.resets_at || null, explanation: msg || "101 AI has used today's free AI allowance (it resets at 03:00 Kampala time). Open the source to read the story." };
        if (r.status === 404 || r.status === 405) { if (await settle()) return previewExplain(n); return { offline: true, explanation: "Explain isn't switched on for this version of the site yet. Open the source to read the story, or ask 101 AI (the robot button) about it." }; }
        if (r.status === 429) return { offline: true, retry: true, explanation: msg || "You're asking a little fast. Wait a minute, then try Explain again." };
        if (r.status === 400 && msg) return { offline: true, retry: true, explanation: msg };
        return { offline: true, retry: true, explanation: AI_UNAVAILABLE };
      } catch (e) {
        if (await settle()) return previewExplain(n);
        return { offline: true, retry: true, explanation: e && e.name === "AbortError" ? "101 AI took too long to answer. Try Explain again, or open the source to read the story." : (navigator.onLine === false ? "You're offline. Reconnect, then try Explain again." : "101 AI can't be reached right now. Open the source to read the story, or try Explain again in a moment.") };
      } finally { clearTimeout(t); }
    }
    if (await settle()) return previewExplain(n);
    return { offline: true, explanation: "101 AI isn't available in this offline preview. Open the source to read the story." };
  }
  function previewExplain(n) {
    return { preview: true, explanation: `In simple words: ${n.summary || n.title}\n\nWhy it matters for you: stories like this show where tech jobs, tools and money are moving. Try one small thing this week — read the source, then ask 101 AI how you could use it in a project.` };
  }


  /* ---------- Opportunities ---------- */
  async function fetchOpportunities(q = {}) {
    let rows; try { rows = list(await call("/opportunities?" + new URLSearchParams(q))).map(mapOpp); } catch (e) { rows = (await settle()) ? D().opportunities.slice() : []; }
    return rows.filter(o => !o.status || o.status === "approved" || o.status === "published").sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  }
  async function submitOpportunity(o) {
    try { return await post("/opportunities", o); }
    catch (e) { if (!(await settle())) return { ...NOT_SENT }; const q = ls.get("cc_opp_pending", []); const item = { id: "ops" + Date.now(), status: "pending", submittedAt: new Date().toISOString(), ...o }; q.unshift(item); ls.set("cc_opp_pending", q); return { ...item, offline: true }; }
  }
  const pendingOpportunities = () => ls.get("cc_opp_pending", []);
  function reviewOpportunity(id, approve) { const q = pendingOpportunities().filter(o => o.id !== id); ls.set("cc_opp_pending", q); return soft(post(`/opportunities/${encodeURIComponent(id)}/${approve ? "approve" : "reject"}`, {})); }
  function remind(id, daysBefore = 3) { const r = ls.get("cc_opp_remind", {}); if (r[id]) delete r[id]; else r[id] = daysBefore; ls.set("cc_opp_remind", r); soft(post(`/opportunities/${encodeURIComponent(id)}/remind`, { days_before: r[id] ? daysBefore : 0 })); return !!r[id]; }
  const reminders = () => ls.get("cc_opp_remind", {});

  /* ---------- Saved (news + opportunities) ---------- */
  const saved = kind => new Set(ls.get("cc_saved_" + kind, []));
  function toggleSave(kind, id) { const s = saved(kind); const on = !s.has(id); on ? s.add(id) : s.delete(id); ls.set("cc_saved_" + kind, [...s]); soft(post("/saved", { kind, id, saved: on })); return on; }

  /* ---------- Events & Meetups ---------- */
  const ED = () => window.CC_EVENTS_DATA;
  async function fetchEvents(q = {}) {
    let rows; try { rows = list(await call("/events?" + new URLSearchParams(q))).map(mapEvent); } catch (e) { rows = (await settle()) ? ED().events.slice() : []; }
    const g = ls.get("cc_ev_going", {});
    return rows.filter(x => !x.status || x.status === "approved").map(x => ({ ...x, going: (x.going || 0) + (g[x.id] ? 1 : 0), me: !!g[x.id] })).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  function toggleGoing(id) { const g = ls.get("cc_ev_going", {}); g[id] ? delete g[id] : g[id] = 1; ls.set("cc_ev_going", g); soft(post(`/events/${encodeURIComponent(id)}/going`, { going: !!g[id] })); return !!g[id]; }
  const tickets = () => ls.get("cc_ev_tickets", []);
  async function rsvp(id, person) {
    try { const r = await post(`/events/${encodeURIComponent(id)}/rsvp`, person); if (r && r.ticket) return r.ticket; } catch (e) { /* offline preview */ }
    if (!(await settle())) throw new Error("Your RSVP wasn't sent: the server can't be reached. No ticket was issued; try again.");
    const code = "101-" + id.replace(/^ev101-/, "").toUpperCase().slice(0, 6) + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const t = { code, eventId: id, name: person.name, email: person.email, level: person.level || "", at: new Date().toISOString(), checkedIn: false, offline: true };
    ls.set("cc_ev_tickets", [t, ...tickets().filter(x => x.eventId !== id)]); const g = ls.get("cc_ev_going", {}); g[id] = 1; ls.set("cc_ev_going", g); return t;
  }
  async function attendees(id) {
    try { return list(await call(`/events/${encodeURIComponent(id)}/attendees`)); } catch (e) { /* preview: placeholder list + this browser's tickets */ }
    if (!(await settle())) return [];
    const demo = ["Amooti K.", "Nakato S.", "Okello J.", "Achieng M.", "Mugisha R."].map((n, i) => ({ name: n, code: `101-DEMO-${i + 1}`, level: ["University", "A-Level", "University", "Professional", "O-Level"][i], checkedIn: i < 2 }));
    return [...tickets().filter(t => t.eventId === id), ...demo];
  }
  function checkIn(code) { const t = tickets(); const hit = t.find(x => x.code === code.trim().toUpperCase()); if (hit) { hit.checkedIn = true; ls.set("cc_ev_tickets", t); } soft(post("/events/checkin", { code })); return hit || (demoOK() && /^101-DEMO-\d$/.test(code.trim().toUpperCase()) ? { code, name: "Demo attendee", checkedIn: true } : null); }
  /* r12 QA fix 3: member submissions go to POST /v1/events/external (sign-in required, honeypot "website", 5 per user per day).
     The form's org keys map to the backend enum; region "online" → mode online. Each refusal gets an honest message. */
  const EV_ORG = { gdg: "google_gdg", microsoft: "microsoft", openai: "openai", anthropic: "anthropic", huggingface: "hugging_face", alibaba: "alibaba_cloud", aws: "aws", mlh: "mlh", "101": "101" };
  const eventBody = o => { const b = { title: o.title, organiser: EV_ORG[o.org] || "other", mode: o.region === "online" ? "online" : "physical", starts_at: o.start, source_url: o.url, website: o.website || "" };
    if (o.end) b.ends_at = o.end; if (o.venue) b.venue = String(o.venue).slice(0, 200); if (o.region === "kampala") b.city = "Kampala"; return b; };
  async function submitEvent(o) {
    if (!STATIC && location.protocol !== "file:") {
      let r = null, j = null;
      try { r = await fetch(`${BASE}/events/external`, { method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(eventBody(o)) }); try { j = await r.json(); } catch (e) { /* not JSON */ } }
      catch (e) { r = null; }
      if (r && r.ok) return (j && j.data) || { status: "pending_review" };
      const m = j && j.error && j.error.message;
      if (r && (r.status === 401 || r.status === 403)) return { offline: true, notSent: true, message: "Not sent: sign in to submit an event." };
      if (r && r.status === 429) return { offline: true, notSent: true, message: m || "Not sent: you can submit up to 5 events a day. Please try again tomorrow." };
      if (r && (r.status === 400 || r.status === 422)) return { offline: true, notSent: true, message: "Not sent: check the details. The official link must start with https:// and the start time must be a real date." };
      if (r && r.status === 409) return { offline: true, notSent: true, message: "Not sent: that event link has already been submitted." };
    }
    if (!(await settle())) return { ...NOT_SENT };
    const q = ls.get("cc_ev_pending", []); const item = { id: "evs" + Date.now(), status: "pending", submittedAt: new Date().toISOString(), ...o }; q.unshift(item); ls.set("cc_ev_pending", q); return { ...item, offline: true };
  }
  const pendingEvents = () => ls.get("cc_ev_pending", []);
  function reviewEvent(id, approve) { ls.set("cc_ev_pending", pendingEvents().filter(o => o.id !== id)); return soft(post(`/events/${encodeURIComponent(id)}/${approve ? "approve" : "reject"}`, {})); }

  /* go.html lookup: news + opportunities ids → original source url */
  window.CC_FEED_GO = () => [...(D() ? D().news.concat(D().opportunities) : []), ...(ED() ? ED().events : []), ...(window.__ccFeedNews || [])];

  /* organiser view: admins see every 101-hosted event; anyone else only the events the server marked `organiser: true`
     (they created it). [] = the organiser view and its button stay hidden (visitors, guests, ordinary members). */
  const STAFF = ["admin", "root_admin"];
  function organiserEvents(all, role) {
    const hosted = (Array.isArray(all) ? all : []).filter(e => e && e.host101);
    if (STAFF.includes(role)) return hosted;
    if (!role || role === "visitor" || role === "guest") return [];
    return hosted.filter(e => e.organiser === true);
  }
  window.CC_FEED_API = { organiserEvents, _unwrap: unwrap, _map: { mapAnn, mapNews, mapOpp, mapEvent }, fetchAnnouncements, postAnnouncement, readSet, markRead, fetchNews, explainNews, fetchOpportunities, submitOpportunity, pendingOpportunities, reviewOpportunity, remind, reminders, saved, toggleSave, fetchEvents, toggleGoing, tickets, rsvp, attendees, checkIn, submitEvent, _eventBody: eventBody, pendingEvents, reviewEvent, STATIC, demoOK };
})();
