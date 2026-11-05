/* 101 Codecrafts — CCCourses: the tutor course builder's data layer (round 11, r11/dash).
   ONE interface, two adapters:
     api   — the real backend (/api/v1/tutor/courses …, migration 20261105020000_course_builder.sql). Default.
     local — this browser only (localStorage, per signed-in user), used when the host has no backend, the server
             answers 5xx (e.g. the migration isn't applied yet), or a headless QA session is active. Everything the
             tutor saves is still THEIR real data; the UI labels it "Saved on this device".
   Lesson shapes match backend lib/lesson-input.ts:
     video {youtube}            -> payload.youtube_id   (played via youtube-nocookie.com)
     book  {isbn?, url?, note?} -> payload.isbn / payload.url (ISBN check digit validated)
     text  {content_md}
     file  {url, file_name?}    -> payload.url (https, structural link check)
     quiz  {questions:[{q, options[], answer}]} -> payload.questions (no answers) + answers (owner only) */
(function () {
  "use strict";
  const BASE = "/api/v1";
  const YT = /^[A-Za-z0-9_-]{11}$/;
  const SHORT = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc)$/i;

  /* ---------- validation (mirrors the server) ---------- */
  function youtubeId(input) {
    const s = String(input || "").trim(); if (YT.test(s)) return s;
    let u; try { u = new URL(s); } catch (e) { return null; }
    const host = u.hostname.replace(/^(www\.|m\.)/, ""); let id = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (["youtube.com", "youtube-nocookie.com", "music.youtube.com"].indexOf(host) >= 0) {
      const p = u.pathname.split("/").filter(Boolean);
      id = p[0] === "watch" ? u.searchParams.get("v") : ["embed", "shorts", "live", "v"].indexOf(p[0]) >= 0 ? p[1] : null;
    }
    return id && YT.test(id) ? id : null;
  }
  function isbn(input) {
    const s = String(input || "").replace(/[\s-]/g, "").toUpperCase();
    if (/^\d{9}[\dX]$/.test(s)) return s.split("").reduce((a, ch, i) => a + (ch === "X" ? 10 : +ch) * (10 - i), 0) % 11 === 0 ? s : null;
    if (/^\d{13}$/.test(s)) return s.split("").reduce((a, ch, i) => a + +ch * (i % 2 ? 3 : 1), 0) % 10 === 0 ? s : null;
    return null;
  }
  function linkVerdict(raw) {
    if (!raw) return "empty"; if (raw.length > 2048) return "too_long";
    let u; try { u = new URL(raw); } catch (e) { return "invalid"; }
    if (u.protocol !== "https:") return "not_https";
    if (u.username || u.password) return "has_credentials";
    const h = u.hostname.toLowerCase();
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.charAt(0) === "[") return "ip_address";
    if (/(^|\.)(localhost|local|internal|lan|home\.arpa)$/.test(h)) return "private_host";
    if (SHORT.test(h)) return "shortener";
    return "ok";
  }
  const VERDICT_MSG = { empty: "Add a link.", invalid: "That isn't a valid link.", not_https: "Links must start with https://", has_credentials: "Links can't contain a username or password.",
    ip_address: "Use a site name, not a raw IP address.", private_host: "That address only works on a private network.", shortener: "Paste the full link, not a shortened one (bit.ly etc.).", too_long: "That link is too long." };

  /** Validate a lesson form object → {ok, row, error}. row = the DB-shaped lesson (kind, title, payload, content_md, answers?). */
  function lessonRow(f) {
    const title = String(f.title || "").trim();
    if (title.length < 2) return { ok: false, field: "title", error: "Give the lesson a title (2+ characters)." };
    const base = { kind: f.kind, title, is_preview: !!f.is_preview };
    switch (f.kind) {
      case "video": { const id = youtubeId(f.youtube); if (!id) return { ok: false, field: "youtube", error: "Paste a YouTube link (youtube.com/watch?v=…, youtu.be/…) or an 11-character video id." };
        return { ok: true, row: Object.assign(base, { payload: { youtube_id: id }, content_md: f.note || null }) }; }
      case "book": { const i = f.isbn ? isbn(f.isbn) : null;
        if (f.isbn && !i) return { ok: false, field: "isbn", error: "That ISBN's check digit is wrong. Copy it from the back cover or the copyright page." };
        if (f.url && linkVerdict(f.url) !== "ok") return { ok: false, field: "url", error: VERDICT_MSG[linkVerdict(f.url)] };
        if (!i && !f.url) return { ok: false, field: "isbn", error: "Give an ISBN or a link to the book." };
        const p = {}; if (i) p.isbn = i; if (f.url) p.url = f.url; if (f.book_title) p.book_title = f.book_title; if (f.author) p.author = f.author; if (f.cover && linkVerdict(f.cover) === "ok") p.cover = f.cover;
        return { ok: true, row: Object.assign(base, { payload: p, content_md: f.note || null }) }; }
      case "text": { const md = String(f.content_md || ""); if (!md.trim()) return { ok: false, field: "content_md", error: "Write the lesson text (Markdown works)." };
        if (md.length > 100000) return { ok: false, field: "content_md", error: "That's over 100,000 characters. Split it into two lessons." };
        return { ok: true, row: Object.assign(base, { payload: {}, content_md: md }) }; }
      case "file": { const v = linkVerdict(f.url); if (v !== "ok") return { ok: false, field: "url", error: VERDICT_MSG[v] };
        const p = { url: f.url }; if (f.file_name) p.file_name = String(f.file_name).slice(0, 200);
        return { ok: true, row: Object.assign(base, { payload: p, content_md: f.note || null }) }; }
      case "quiz": { const qs = (f.questions || []).filter(q => q && String(q.q || "").trim());
        if (!qs.length) return { ok: false, field: "questions", error: "Add at least one question." };
        for (let i = 0; i < qs.length; i++) { const q = qs[i], opts = (q.options || []).map(o => String(o || "").trim()).filter(Boolean);
          if (opts.length < 2) return { ok: false, field: "questions", error: `Question ${i + 1} needs at least two options.` };
          if (!(q.answer >= 0 && q.answer < opts.length)) return { ok: false, field: "questions", error: `Pick the correct option for question ${i + 1}.` }; }
        const clean = qs.map(q => ({ q: String(q.q).trim(), options: q.options.map(o => String(o || "").trim()).filter(Boolean) }));
        return { ok: true, row: Object.assign(base, { payload: { pass_pct: 70, questions: clean }, content_md: null, answers: qs.map(q => +q.answer) }) }; }
      default: return { ok: false, field: "kind", error: "Pick a lesson type." };
    }
  }
  /** row → API request body (the server re-derives the payload). */
  function lessonBody(row) {
    const b = { kind: row.kind, title: row.title, is_preview: row.is_preview };
    if (row.kind === "video") b.youtube = row.payload.youtube_id;
    if (row.kind === "book") Object.assign(b, row.payload, row.content_md ? { note: row.content_md } : {});
    if (row.kind === "text") b.content_md = row.content_md;
    if (row.kind === "file") Object.assign(b, row.payload, row.content_md ? { note: row.content_md } : {});
    if (row.kind === "quiz") b.questions = row.payload.questions.map((q, i) => ({ q: q.q, options: q.options, answer: row.answers[i] }));
    return b;
  }

  /** Client mirror of app.course_checklist(). */
  function checklist(tree) {
    const c = tree.course || {}, mods = tree.modules || [], lessons = mods.flatMap(m => m.lessons || []);
    const links = [];
    if (c.cover_url) links.push(c.cover_url);
    lessons.forEach(l => { if (l.payload && l.payload.url) links.push(l.payload.url); });
    return [
      { key: "title", ok: (c.title || "").trim().length >= 3, label: "Course title (3+ characters)" },
      { key: "summary", ok: (c.summary || "").trim().length >= 10, label: "Short summary (10+ characters)" },
      { key: "has_module", ok: mods.length > 0, label: "At least one module" },
      { key: "has_lesson", ok: lessons.length > 0, label: "At least one lesson" },
      { key: "modules_have_lessons", ok: mods.length > 0 && mods.every(m => (m.lessons || []).length), label: "Every module has a lesson" },
      { key: "lessons_have_content", ok: lessons.every(l => l.kind !== "text" || (l.content_md || "").trim()), label: "Every lesson has content" },
      { key: "quizzes_have_keys", ok: lessons.every(l => l.kind !== "quiz" || (Array.isArray(l.answers) && l.answers.length)), label: "Every quiz has its answers set" },
      { key: "links_safe", ok: links.every(u => linkVerdict(u) === "ok"), label: "All links are safe (https, full links, no IPs)" },
      { key: "price", ok: c.requested_price_ugx != null || c.is_free != null, label: "Pricing chosen (free or a price)" }
    ];
  }


  /* ---------- safe Markdown (lesson text): everything is escaped first; only https links survive ---------- */
  function md(src) {
    const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const inline = t => esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/(^|[\s(])_([^_\s][^_]*)_/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s"]+)\)/g, (m, t, u) => linkVerdict(u.replace(/&amp;/g, "&")) === "ok" ? `<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">${t}</a>` : t);
    const out = []; let list = null, para = [], code = null;
    const flushP = () => { if (para.length) { out.push("<p>" + para.map(inline).join(" ") + "</p>"); para = []; } };
    const flushL = () => { if (list) { out.push(`<${list.t}>` + list.items.map(i => "<li>" + inline(i) + "</li>").join("") + `</${list.t}>`); list = null; } };
    String(src || "").replace(/\r\n?/g, "\n").split("\n").forEach(line => {
      if (code !== null) { if (/^```/.test(line)) { out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>"); code = null; } else code.push(line); return; }
      if (/^```/.test(line)) { flushP(); flushL(); code = []; return; }
      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushP(); flushL(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); return; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flushP(); if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; } list.items.push(m[1]); return; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [] }; } list.items.push(m[1]); return; }
      if (!line.trim()) { flushP(); flushL(); return; }
      flushL(); para.push(line.trim());
    });
    if (code !== null) out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
    flushP(); flushL();
    return out.join("");
  }

  /* ---------- status vocabulary (UI chips) ---------- */
  function statusOf(c, subs) {
    const last = (subs || [])[0];
    if (c.status === "pending_review" || (last && last.status === "pending")) return { key: "review", label: "In review" };
    if (c.status === "published") return { key: "approved", label: "Approved" };
    if (c.status === "rejected" || (last && last.status === "rejected" && c.status !== "published")) return { key: "rejected", label: "Rejected", reason: c.review_note || (last && last.reason) || "" };
    if (c.status === "archived") return { key: "archived", label: "Archived" };
    return { key: "draft", label: "Draft" };
  }

  /* ---------- api adapter ---------- */
  async function authHeaders() {
    const h = { Accept: "application/json", "Content-Type": "application/json" };
    try { const c = window.CC_AUTH && window.CC_AUTH.clerk; const t = c && c.session && await c.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e) {}
    return h;
  }
  class ApiError extends Error { constructor(status, code, msg) { super(msg); this.status = status; this.code = code; } }
  async function call(method, path, body) {
    const r = await fetch(BASE + path, { method, credentials: "include", headers: await authHeaders(), body: body === undefined ? undefined : JSON.stringify(body) });
    const ct = r.headers.get("content-type") || ""; let j = null;
    if (/json/.test(ct)) j = await r.json().catch(() => null);
    if (!r.ok) {
      const e = j && j.error; throw new ApiError(r.status, (e && e.code) || (ct.indexOf("json") < 0 ? "no_backend" : "error"), (e && e.message) || ("HTTP " + r.status));
    }
    return j && Object.prototype.hasOwnProperty.call(j, "data") ? j.data : j;
  }
  const api = {
    name: "api",
    list: () => call("GET", "/tutor/courses"),
    create: c => call("POST", "/tutor/courses", c),
    get: id => call("GET", "/tutor/courses/" + id),
    update: (id, p) => call("PATCH", "/tutor/courses/" + id, p),
    remove: id => call("DELETE", "/tutor/courses/" + id),
    addModule: (cid, m) => call("POST", `/tutor/courses/${cid}/modules`, m),
    updateModule: (id, p) => call("PATCH", "/tutor/modules/" + id, p),
    removeModule: id => call("DELETE", "/tutor/modules/" + id),
    addLesson: (mid, row) => call("POST", `/tutor/modules/${mid}/lessons`, lessonBody(row)),
    updateLesson: (id, row) => call("PATCH", "/tutor/lessons/" + id, lessonBody(row)),
    removeLesson: id => call("DELETE", "/tutor/lessons/" + id),
    reorder: (cid, modules, lessons) => call("POST", `/tutor/courses/${cid}/reorder`, { modules, lessons }),
    submit: (cid, note) => call("POST", `/tutor/courses/${cid}/submit`, { note }),
    withdraw: cid => call("POST", `/tutor/courses/${cid}/withdraw`),
    gradeQuiz: (lid, answers) => call("POST", `/lessons/${lid}/quiz`, { answers })
  };

  /* ---------- local adapter (this browser) ---------- */
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "l-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const now = () => new Date().toISOString();
  const who = () => { const u = (window.CCAccess && window.CCAccess.user) || (window.CC_AUTH && window.CC_AUTH.user); return (u && (u.id || u.email)) || "anon"; };
  const KEY = () => "cc_builder_v1:" + who();
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY()) || "null") || { courses: {} }; } catch (e) { return { courses: {} }; } };
  const save = db => { localStorage.setItem(KEY(), JSON.stringify(db)); try { dispatchEvent(new CustomEvent("cc:courses")); } catch (e) {} };
  const findMod = (db, mid) => { for (const t of Object.values(db.courses)) { const m = t.modules.find(x => x.id === mid); if (m) return [t, m]; } return [null, null]; };
  const findLesson = (db, lid) => { for (const t of Object.values(db.courses)) for (const m of t.modules) { const l = m.lessons.find(x => x.id === lid); if (l) return [t, m, l]; } return [null, null, null]; };
  const err = (status, msg) => { throw new ApiError(status, "local", msg); };
  const editable = t => { if (t.course.status === "pending_review") err(403, "This course is in review. Withdraw it to edit."); };
  const touch = t => { t.course.updated_at = now(); };
  const local = {
    name: "local",
    async list() { return Object.values(load().courses).filter(t => !t.course.deleted_at).map(t => Object.assign({}, t.course, { _modules: t.modules.length, _lessons: t.modules.reduce((a, m) => a + m.lessons.length, 0), _pending: (t.submissions[0] || {}).status === "pending", _subs: t.submissions })).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); },
    async create(c) {
      const db = load(), id = uid();
      const price = c.pricing ? (c.pricing.mode === "free" ? 0 : c.pricing.price_ugx) : null;
      db.courses[id] = { course: { id, slug: id, title: c.title, summary: c.summary || "", description: c.description || "", level: c.level || "beginner", cover_url: c.cover_url || null, tags: c.tags || [],
        status: "draft", review_note: null, is_free: true, price_ugx: 0, requested_price_ugx: price, tutor_id: who(), created_at: now(), updated_at: now() }, modules: [], submissions: [] };
      save(db); return db.courses[id].course;
    },
    async get(id) { const t = load().courses[id]; if (!t || t.course.deleted_at) err(404, "Course not found"); return JSON.parse(JSON.stringify(t)); },
    async update(id, p) { const db = load(), t = db.courses[id]; if (!t) err(404, "Course not found"); editable(t);
      const q = Object.assign({}, p); if (q.pricing) { q.requested_price_ugx = q.pricing.mode === "free" ? 0 : q.pricing.price_ugx; delete q.pricing; }
      Object.assign(t.course, q); touch(t); save(db); return t.course; },
    async remove(id) { const db = load(), t = db.courses[id]; if (!t) err(404, "Course not found");
      if (["draft", "rejected"].indexOf(t.course.status) < 0) err(409, "Only draft or rejected courses can be deleted"); t.course.deleted_at = now(); save(db); return { ok: true }; },
    async addModule(cid, m) { const db = load(), t = db.courses[cid]; if (!t) err(404, "Course not found"); editable(t);
      const mod = { id: uid(), title: m.title, summary: m.summary || "", position: t.modules.length, approved: false, lessons: [] }; t.modules.push(mod); touch(t); save(db); return mod; },
    async updateModule(id, p) { const db = load(), [t, m] = findMod(db, id); if (!m) err(404, "Module not found"); editable(t); Object.assign(m, p, { approved: false }); touch(t); save(db); return m; },
    async removeModule(id) { const db = load(), [t, m] = findMod(db, id); if (!m) err(404, "Module not found"); editable(t); t.modules = t.modules.filter(x => x !== m); t.modules.forEach((x, i) => x.position = i); touch(t); save(db); return { ok: true }; },
    async addLesson(mid, row) { const db = load(), [t, m] = findMod(db, mid); if (!m) err(404, "Module not found"); editable(t);
      const l = Object.assign({ id: uid(), module_id: mid, position: m.lessons.length, approved: false }, JSON.parse(JSON.stringify(row))); m.lessons.push(l); touch(t); save(db); return l; },
    async updateLesson(id, row) { const db = load(), [t, , l] = findLesson(db, id); if (!l) err(404, "Lesson not found"); editable(t);
      ["youtube_id"].forEach(() => {}); Object.keys(l).forEach(k => { if (["id", "module_id", "position"].indexOf(k) < 0) delete l[k]; });
      Object.assign(l, JSON.parse(JSON.stringify(row)), { approved: false }); touch(t); save(db); return l; },
    async removeLesson(id) { const db = load(), [t, m, l] = findLesson(db, id); if (!l) err(404, "Lesson not found"); editable(t); m.lessons = m.lessons.filter(x => x !== l); m.lessons.forEach((x, i) => x.position = i); touch(t); save(db); return { ok: true }; },
    async reorder(cid, modules, lessons) { const db = load(), t = db.courses[cid]; if (!t) err(404, "Course not found"); editable(t);
      const all = {}; t.modules.forEach(m => m.lessons.forEach(l => all[l.id] = l));
      t.modules.sort((a, b) => modules.indexOf(a.id) - modules.indexOf(b.id)).forEach((m, i) => m.position = i);
      Object.keys(lessons || {}).forEach(mid => { const m = t.modules.find(x => x.id === mid); if (!m) return; m.lessons = lessons[mid].map(id => all[id]).filter(Boolean); });
      const seen = new Set(); t.modules.forEach(m => { m.lessons = m.lessons.filter(l => !seen.has(l.id) && seen.add(l.id)); m.lessons.forEach((l, i) => { l.module_id = m.id; l.position = i; }); });
      touch(t); save(db); return { ok: true }; },
    async submit(cid, note) { const db = load(), t = db.courses[cid]; if (!t) err(404, "Course not found");
      if (t.course.status === "pending_review" || (t.submissions[0] || {}).status === "pending") err(409, "Already in review");
      const bad = checklist(t).filter(x => !x.ok); if (bad.length) err(400, "Checklist incomplete: " + bad.map(x => x.label).join(", "));
      const kind = t.course.status !== "published" ? "new" : (t.course.requested_price_ugx != null && t.course.requested_price_ugx !== t.course.price_ugx ? "price" : "update");
      const sub = { id: uid(), kind, status: "pending", note: note || null, requested_price_ugx: t.course.requested_price_ugx, created_at: now(), local: true };
      t.submissions.unshift(sub); if (t.course.status !== "published") t.course.status = "pending_review"; touch(t); save(db); return { submission_id: sub.id, status: "pending", kind }; },
    async withdraw(cid) { const db = load(), t = db.courses[cid]; if (!t) err(404, "Course not found"); const s = t.submissions.find(x => x.status === "pending"); if (!s) err(400, "Nothing to withdraw");
      s.status = "withdrawn"; if (t.course.status === "pending_review") t.course.status = "draft"; touch(t); save(db); return { status: t.course.status }; },
    async gradeQuiz(lid, answers) { const db = load(), [, , l] = findLesson(db, lid); if (!l) err(404, "Quiz not found");
      const key = l.answers || [], correct = key.map((a, i) => answers[i] === a); return { score: correct.filter(Boolean).length, total: key.length, correct }; },
    /* admin console hook (same device demo only): review a local submission */
    async review(cid, decision, reason, price) {
      if (!(window.CCAccess && window.CCAccess.can("course.review"))) err(403, "Admins only");
      const db = load(), t = db.courses[cid]; const s = t && t.submissions.find(x => x.status === "pending"); if (!s) err(400, "Nothing pending");
      if (decision === "rejected" && String(reason || "").trim().length < 5) err(400, "Give the tutor a reason (5+ characters)");
      s.status = decision; s.reason = reason || null; s.reviewed_at = now();
      if (decision === "approved") { const p = price != null ? price : (s.requested_price_ugx || 0); Object.assign(t.course, { status: "published", is_free: p === 0, price_ugx: p, requested_price_ugx: null, review_note: null }); t.modules.forEach(m => { m.approved = true; m.lessons.forEach(l => l.approved = true); }); }
      else if (t.course.status === "pending_review") Object.assign(t.course, { status: "rejected", review_note: reason });
      save(db); return { status: decision };
    }
  };

  /* ---------- adapter selection ---------- */
  let chosen = null, why = "";
  async function adapter() {
    if (chosen) return chosen;
    if (window.__CC_QA_SESSION__ || /[?&]local=1/.test(location.search)) { why = "qa"; return (chosen = local); }
    if (location.protocol === "file:" || (window.CC_NO_BACKEND && window.CC_NO_BACKEND())) { why = "no_backend"; return (chosen = local); }
    try { await api.list(); return (chosen = api); }
    catch (e) {
      if (e.status === 401 || e.status === 403) { chosen = api; throw e; }   // a real auth answer: never hide it behind local data
      why = e.code === "no_backend" || e.status === 404 ? "no_backend" : "server"; return (chosen = local);
    }
  }
  const wrap = name => async function () { const a = await adapter(); return a[name].apply(a, arguments); };
  const CC = window.CCCourses = { youtubeId, isbn, linkVerdict, VERDICT_MSG, lessonRow, checklist, statusOf, ApiError, md,
    adapter, get mode() { return chosen ? chosen.name : null; }, get why() { return why; } };
  ["list", "create", "get", "update", "remove", "addModule", "updateModule", "removeModule", "addLesson", "updateLesson", "removeLesson", "reorder", "submit", "withdraw", "gradeQuiz"].forEach(n => CC[n] = wrap(n));
  CC.reviewLocal = (...a) => local.review(...a);
  /** Local submissions on this device (for the admin console's same-device demo queue). */
  CC.localSubmissions = () => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^cc_builder_v1:/.test(k)) continue;
    try { Object.values(JSON.parse(localStorage.getItem(k)).courses).forEach(t => t.submissions.filter(s => s.status === "pending").forEach(s => out.push({ course: t.course, submission: s }))); } catch (e) {} } return out; };
})();
