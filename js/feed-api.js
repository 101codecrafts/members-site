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
   Every call falls back to js/feed-data.js placeholders + localStorage, so the pages work offline and on file://. */
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
      if (!r.ok) throw new Error(r.status + " " + path); return await r.json();
    } finally { clearTimeout(t); }
  }
  const post = (p, body) => call(p, { method: "POST", body: JSON.stringify(body) });
  const soft = p => p.catch(() => ({ ok: true, offline: true }));

  /* ---------- Announcements ---------- */
  async function fetchAnnouncements(q = {}) {
    let list; try { list = await call("/announcements?" + new URLSearchParams(q)); } catch (e) { list = [...ls.get("cc_ann_local", []), ...D().announcements]; }
    const now = Date.now();
    return list.filter(a => (!a.expiresAt || Date.parse(a.expiresAt) > now) && (!a.publishedAt || Date.parse(a.publishedAt) <= now))
      .sort((a, b) => (b.pinned - a.pinned) || (Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
  }
  async function postAnnouncement(a) {
    try { return await post("/announcements", a); }
    catch (e) { const local = ls.get("cc_ann_local", []); const item = { id: "al" + Date.now(), author: "Admin", ...a, publishedAt: a.publishAt || new Date().toISOString(), _local: true }; local.unshift(item); ls.set("cc_ann_local", local); return { ...item, offline: true }; }
  }
  const readSet = () => new Set(ls.get("cc_ann_read", []));
  function markRead(ids) { const s = readSet(); ids.forEach(i => s.add(i)); ls.set("cc_ann_read", [...s]); ids.forEach(i => soft(post(`/announcements/${encodeURIComponent(i)}/read`, {}))); }

  /* ---------- News ---------- */
  const TAB_OF = { "Africa Tech": "africa", AI: "ai", Startups: "startups" };
  async function fetchNews(tab = "all") {
    try { const v = await call("/news?" + new URLSearchParams({ date: new Date().toISOString().slice(0, 10), tab })); if (v && v.length) return v; } catch (e) { /* fall through */ }
    let items = D().news.slice();
    /* live fallback: the existing HN + Dev.to fetch in js/api.js, mapped onto our tabs, after the curated items */
    if (!STATIC && window.CC_API && window.CC_API.fetchNews) {
      try { const live = await window.CC_API.fetchNews(); if (live !== window.CC_DATA.news) items = items.concat(live.slice(0, 12).map(n => ({ id: n.id, tab: TAB_OF[n.cat] || "dev", title: n.title, source: n.source, url: n.url, at: null, ago: n.ago, summary: n.summary }))); } catch (e) { /* placeholders only */ }
    }
    window.__ccFeedNews = items; return items;
  }
  async function explainNews(n) {
    try { const r = await post(`/news/${encodeURIComponent(n.id)}/explain`, { title: n.title, url: n.url }); if (r && r.explanation) return r; } catch (e) { /* preview */ }
    return { preview: true, explanation: `In simple words: ${n.summary || n.title}\n\nWhy it matters for you: stories like this show where tech jobs, tools and money are moving. Try one small thing this week — read the source, then ask 101 AI how you could use it in a project.` };
  }

  /* ---------- Opportunities ---------- */
  async function fetchOpportunities(q = {}) {
    let list; try { list = await call("/opportunities?" + new URLSearchParams(q)); } catch (e) { list = D().opportunities.slice(); }
    return list.filter(o => !o.status || o.status === "approved").sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  }
  async function submitOpportunity(o) {
    try { return await post("/opportunities", o); }
    catch (e) { const q = ls.get("cc_opp_pending", []); const item = { id: "ops" + Date.now(), status: "pending", submittedAt: new Date().toISOString(), ...o }; q.unshift(item); ls.set("cc_opp_pending", q); return { ...item, offline: true }; }
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
    let list; try { list = await call("/events?" + new URLSearchParams(q)); } catch (e) { list = ED().events.slice(); }
    const g = ls.get("cc_ev_going", {});
    return list.filter(x => !x.status || x.status === "approved").map(x => ({ ...x, going: (x.going || 0) + (g[x.id] ? 1 : 0), me: !!g[x.id] })).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  function toggleGoing(id) { const g = ls.get("cc_ev_going", {}); g[id] ? delete g[id] : g[id] = 1; ls.set("cc_ev_going", g); soft(post(`/events/${encodeURIComponent(id)}/going`, { going: !!g[id] })); return !!g[id]; }
  const tickets = () => ls.get("cc_ev_tickets", []);
  async function rsvp(id, person) {
    try { const r = await post(`/events/${encodeURIComponent(id)}/rsvp`, person); if (r && r.ticket) return r.ticket; } catch (e) { /* offline preview */ }
    const code = "101-" + id.replace(/^ev101-/, "").toUpperCase().slice(0, 6) + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const t = { code, eventId: id, name: person.name, email: person.email, level: person.level || "", at: new Date().toISOString(), checkedIn: false, offline: true };
    ls.set("cc_ev_tickets", [t, ...tickets().filter(x => x.eventId !== id)]); const g = ls.get("cc_ev_going", {}); g[id] = 1; ls.set("cc_ev_going", g); return t;
  }
  async function attendees(id) {
    try { return await call(`/events/${encodeURIComponent(id)}/attendees`); } catch (e) { /* preview: placeholder list + this browser's tickets */ }
    const demo = ["Amooti K.", "Nakato S.", "Okello J.", "Achieng M.", "Mugisha R."].map((n, i) => ({ name: n, code: `101-DEMO-${i + 1}`, level: ["University", "A-Level", "University", "Professional", "O-Level"][i], checkedIn: i < 2 }));
    return [...tickets().filter(t => t.eventId === id), ...demo];
  }
  function checkIn(code) { const t = tickets(); const hit = t.find(x => x.code === code.trim().toUpperCase()); if (hit) { hit.checkedIn = true; ls.set("cc_ev_tickets", t); } soft(post("/events/checkin", { code })); return hit || (/^101-DEMO-\d$/.test(code.trim().toUpperCase()) ? { code, name: "Demo attendee", checkedIn: true } : null); }
  async function submitEvent(o) {
    try { return await post("/events", o); }
    catch (e) { const q = ls.get("cc_ev_pending", []); const item = { id: "evs" + Date.now(), status: "pending", submittedAt: new Date().toISOString(), ...o }; q.unshift(item); ls.set("cc_ev_pending", q); return { ...item, offline: true }; }
  }
  const pendingEvents = () => ls.get("cc_ev_pending", []);
  function reviewEvent(id, approve) { ls.set("cc_ev_pending", pendingEvents().filter(o => o.id !== id)); return soft(post(`/events/${encodeURIComponent(id)}/${approve ? "approve" : "reject"}`, {})); }

  /* go.html lookup: news + opportunities ids → original source url */
  window.CC_FEED_GO = () => [...(D() ? D().news.concat(D().opportunities) : []), ...(ED() ? ED().events : []), ...(window.__ccFeedNews || [])];

  window.CC_FEED_API = { fetchAnnouncements, postAnnouncement, readSet, markRead, fetchNews, explainNews, fetchOpportunities, submitOpportunity, pendingOpportunities, reviewOpportunity, remind, reminders, saved, toggleSave, fetchEvents, toggleGoing, tickets, rsvp, attendees, checkIn, submitEvent, pendingEvents, reviewEvent, STATIC };
})();
