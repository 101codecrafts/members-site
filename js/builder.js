/* Course builder (round 11). ONE entry point for "Create course" and "Create lesson":
     builder.html                      → create a course (and continue any course you already have)
     builder.html?add=lesson           → pick the course for the lesson (or create one first), then the lesson editor
     builder.html?id=<course>[&tab=details|curriculum|pricing|review][&add=lesson]
   Course → modules → lessons (video via youtube-nocookie, book by ISBN or link, text/Markdown, file link, quiz).
   Pricing: free, or a price the tutor REQUESTS (an admin approves). Drafts → "Submit for review" → admin queue.
   Data: CCCourses (js/course-store.js) — the real API, or this device when the API isn't connected. */
(async function () {
  const D = window.CCDash, C = window.CCCourses; if (!D || !C) return;
  const { $, esc, ico, ugx, num, bar, empty } = D;
  const root = $("#b-root"), bars = $("#b-bars");
  const q = new URLSearchParams(location.search);
  const A = await D.access();
  if (!(A.can && A.can("course.build"))) return;   // the page guard (CCAccess) sends everyone else home

  const KINDS = [
    { k: "video", label: "YouTube video", icon: "yt" }, { k: "book", label: "Book", icon: "openbook" }, { k: "text", label: "Text / Markdown", icon: "doc" },
    { k: "file", label: "File link", icon: "download" }, { k: "quiz", label: "Quiz", icon: "clipboard" }
  ];
  const kindOf = k => KINDS.find(x => x.k === k) || KINDS[2];
  const go = (params) => { const u = new URL(location.href); u.search = new URLSearchParams(params).toString(); location.href = u.pathname + u.search; };
  const setUrl = (params) => { const u = new URL(location.href); u.search = new URLSearchParams(params).toString(); history.replaceState(null, "", u.pathname + u.search); };
  const toast = (msg, bad) => { let t = $("#b-toast"); if (!t) { t = document.createElement("div"); t.id = "b-toast"; t.setAttribute("role", "status"); t.className = "dash-bar"; t.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:50;max-width:min(560px,calc(100vw - 32px));margin:0"; document.body.appendChild(t); }
    t.className = "dash-bar" + (bad ? " err" : ""); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 4200); };
  const fail = e => { toast(e && e.message ? e.message : "Something went wrong. Try again.", true); };
  function busy(btn, on) { if (!btn) return; btn.disabled = on; btn.setAttribute("aria-busy", on ? "true" : "false"); }

  /* adapter + mode banner */
  try { await C.adapter(); }
  catch (e) { root.innerHTML = D.errorBox(e.status === 401 || e.status === 403 ? "Your tutor account couldn't be verified. Sign in again, or ask an admin to verify your tutor profile." : e.message); return; }
  const modeBar = () => C.mode === "local" ? bar("local", `${ico("info")}<span><b>Saved on this device.</b> The course server isn't connected here${C.why === "qa" ? " (test session)" : ""}, so your drafts live in this browser. Use the same browser to keep working.</span>`) : "";

  const id = q.get("id");
  if (!id) return q.get("add") === "lesson" ? pickCourseForLesson() : createView();
  return courseView(id);

  /* ============================== no course yet ============================== */
  function courseForm(opts) {
    return `<form id="b-create" class="card ed" novalidate>
      <div class="sec-title"><h2>${esc(opts.heading || "CREATE A COURSE")}</h2></div>
      ${opts.note ? `<p class="help">${esc(opts.note)}</p>` : ""}
      <label class="field">Course title<input name="title" required minlength="3" maxlength="140" placeholder="e.g. Python for Data Analysis" autocomplete="off"></label>
      <label class="field">Short summary <span class="help">(shown on the course card, 10–300 characters)</span><textarea name="summary" rows="3" maxlength="300" placeholder="What will learners be able to do after this course?" style="min-height:90px;font-family:inherit"></textarea></label>
      <label class="field">Level<select name="level"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend>Pricing</legend><div class="price-opts">
        <label><input type="radio" name="mode" value="free" checked>Free</label><label><input type="radio" name="mode" value="paid">Paid</label></div>
        <label class="field" id="b-price-wrap" hidden>Price you're asking for (UGX)<input name="price" type="number" min="1000" max="100000000" step="500" placeholder="e.g. 25000"><span class="help">An admin approves the price before learners see it. Until then the course stays unpublished.</span></label></fieldset>
      <p class="ferr" id="b-create-err" role="alert"></p>
      <div class="row"><button class="btn or" type="submit">${ico("plusc")}Create course</button><a class="btn" href="tutor.html">Back to dashboard</a></div></form>`;
  }
  function wireCourseForm(after) {
    const f = $("#b-create");
    f.addEventListener("change", e => { if (e.target.name === "mode") $("#b-price-wrap").hidden = f.mode.value !== "paid"; });
    f.onsubmit = async e => {
      e.preventDefault(); const err = $("#b-create-err"); err.textContent = "";
      const title = f.title.value.trim(), summary = f.summary.value.trim();
      if (title.length < 3) { err.textContent = "Give the course a title (3+ characters)."; f.title.focus(); return; }
      let pricing = { mode: "free" };
      if (f.mode.value === "paid") { const p = Math.round(+f.price.value); if (!(p >= 1000 && p <= 100000000)) { err.textContent = "Paid courses cost at least UGX 1,000."; f.price.focus(); return; } pricing = { mode: "paid", price_ugx: p }; }
      const btn = f.querySelector("[type=submit]"); busy(btn, true);
      try { const c = await C.create({ title, summary: summary || undefined, level: f.level.value, pricing }); after(c); }
      catch (x) { err.textContent = x.message; busy(btn, false); }
    };
  }
  async function myCourses() { try { return await C.list(); } catch (e) { return []; } }
  async function createView() {
    const list = await myCourses();
    bars.innerHTML = modeBar();
    root.innerHTML = `<div class="page-h"><div><div class="kicker">Course builder</div><h1>NEW COURSE</h1><p>Start with the basics. You'll add modules and lessons next, preview it, then submit it for review.</p></div></div>
      <div class="grid g2" style="margin-top:16px;align-items:start">${courseForm({})}
      <div class="card"><div class="sec-title"><h2>YOUR COURSES</h2></div>${list.length ? `<div class="dash-list">${list.map(c => { const s = C.statusOf(c, c._subs); return `<div class="dash-li" style="grid-template-columns:1fr auto"><div><b>${esc(c.title)}</b><small><span class="st ${s.key}">${esc(s.label)}</span></small></div><a class="btn sm" href="builder.html?id=${encodeURIComponent(c.id)}">Continue</a></div>`; }).join("")}</div>`
        : empty({ key: "builder-courses", examples: [["Your first course", "Draft"]], title: "Nothing here yet", body: "Courses you create show here so you can come back to them." })}</div></div>`;
    wireCourseForm(c => go({ id: c.id, tab: "curriculum" }));
  }
  async function pickCourseForLesson() {
    const list = (await myCourses()).filter(c => c.status !== "pending_review" && !c._pending);
    bars.innerHTML = modeBar();
    if (!list.length) {
      root.innerHTML = `<div class="page-h"><div><div class="kicker">Course builder</div><h1>CREATE A LESSON</h1><p>Lessons live inside a course. Create the course first; your new lesson opens right after.</p></div></div><div style="margin-top:16px;max-width:720px">${courseForm({ heading: "FIRST, THE COURSE" })}</div>`;
      wireCourseForm(c => go({ id: c.id, tab: "curriculum", add: "lesson" }));
      return;
    }
    root.innerHTML = `<div class="page-h"><div><div class="kicker">Course builder</div><h1>CREATE A LESSON</h1><p>Which course is this lesson for?</p></div><a class="btn" href="builder.html">${ico("plusc")}New course instead</a></div>
      <div class="dash-list" style="margin-top:16px;max-width:720px">${list.map(c => { const s = C.statusOf(c, c._subs); return `<a class="dash-li" style="grid-template-columns:1fr auto;text-decoration:none" href="builder.html?id=${encodeURIComponent(c.id)}&tab=curriculum&add=lesson"><div><b>${esc(c.title)}</b><small>${num(c._lessons != null ? c._lessons : 0)} lessons · <span class="st ${s.key}">${esc(s.label)}</span></small></div><span class="btn sm or">Add lesson here</span></a>`; }).join("")}</div>`;
  }

  /* ============================== one course ============================== */
  async function courseView(courseId) {
    let tree;
    try { tree = await C.get(courseId); }
    catch (e) { bars.innerHTML = modeBar(); root.innerHTML = e.status === 404 ? empty({ key: "missing", title: "We couldn't find that course", body: "It may have been deleted, or it was created in another browser while the course server wasn't connected.", action: { href: "builder.html", label: "Create a course" }, secondary: { href: "tutor.html", label: "Back to dashboard" } }) : D.errorBox(e.message); return; }
    let tab = ["details", "curriculum", "pricing", "review"].indexOf(q.get("tab")) >= 0 ? q.get("tab") : "curriculum";
    let sel = q.get("add") === "lesson" ? { type: "new-lesson", moduleId: null } : null;

    const refresh = async () => { tree = await C.get(courseId); render(); };
    const subs = () => tree.submissions || [];
    const status = () => C.statusOf(tree.course, subs());
    const locked = () => status().key === "review";

    function header() {
      const s = status(), c = tree.course, pending = subs().find(x => x.status === "pending");
      return `<div class="bld-head"><div><div class="kicker">Course builder</div><h1>${esc(c.title)}</h1>
          <div class="row" style="margin-top:8px"><span class="st ${s.key}" id="b-status">${esc(s.label)}</span>${c.status === "published" && pending ? `<span class="muted">Live · update in review</span>` : ""}</div>
          ${s.key === "rejected" && s.reason ? `<p class="st-reason" style="font-size:var(--step--1)"><b>Reviewer's reason:</b> ${esc(s.reason)}</p>` : ""}</div>
        <div class="row"><a class="btn" href="course.html?preview=${encodeURIComponent(c.id)}" id="b-preview">${ico("play")}Preview</a>
          ${pending ? `<button class="btn" type="button" id="b-withdraw">${ico("swap")}Withdraw from review</button>` : `<button class="btn or" type="button" id="b-go-review">${ico("check")}Submit for review</button>`}
          <a class="btn" href="tutor.html">Dashboard</a></div></div>
        ${locked() ? bar("", `${ico("lock")}<span><b>In review.</b> Editing is locked while an admin reviews this course. Withdraw it if you need to change something.</span>`) : ""}
        <div class="bld-tabs" role="tablist" aria-label="Course builder sections">${[["details", "Details"], ["curriculum", "Curriculum"], ["pricing", "Pricing"], ["review", "Review & submit"]].map(([k, l]) =>
          `<button role="tab" type="button" id="tab-${k}" aria-controls="panel" aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}" data-tab="${k}">${l}</button>`).join("")}</div>`;
    }
    function render() {
      bars.innerHTML = modeBar();
      root.innerHTML = header() + `<div id="panel" role="tabpanel" aria-labelledby="tab-${tab}"></div>`;
      const panel = $("#panel");
      ({ details: renderDetails, curriculum: renderCurriculum, pricing: renderPricing, review: renderReview })[tab](panel);
      wireHeader();
      if (locked()) panel.querySelectorAll("input,textarea,select,button[data-edit]").forEach(el => el.disabled = true);
    }
    function wireHeader() {
      root.querySelectorAll("[data-tab]").forEach((b, i, all) => {
        b.onclick = () => { tab = b.dataset.tab; setUrl({ id: courseId, tab }); render(); $("#tab-" + tab).focus(); };
        b.onkeydown = e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length]; n.click(); } };
      });
      const gr = $("#b-go-review"); if (gr) gr.onclick = () => { tab = "review"; setUrl({ id: courseId, tab }); render(); };
      const wd = $("#b-withdraw"); if (wd) wd.onclick = async () => { busy(wd, true); try { await C.withdraw(courseId); toast("Withdrawn. The course is a draft again and you can edit it."); await refresh(); } catch (e) { fail(e); busy(wd, false); } };
    }

    /* ---------- details ---------- */
    function renderDetails(p) {
      const c = tree.course;
      p.innerHTML = `<form class="card ed" id="b-details" novalidate style="max-width:820px">
        <label class="field">Course title<input name="title" required minlength="3" maxlength="140" value="${esc(c.title)}"></label>
        <label class="field">Short summary <span class="help">(10–300 characters, shown on the course card)</span><textarea name="summary" rows="3" maxlength="300" style="min-height:90px;font-family:inherit">${esc(c.summary || "")}</textarea></label>
        <label class="field">Description <span class="help">(Markdown: what's inside, who it's for, what to bring)</span><textarea name="description" rows="8" maxlength="20000">${esc(c.description || "")}</textarea></label>
        <label class="field">Level<select name="level">${["beginner", "intermediate", "advanced"].map(l => `<option value="${l}"${c.level === l ? " selected" : ""}>${l[0].toUpperCase() + l.slice(1)}</option>`).join("")}</select></label>
        <label class="field">Cover image link <span class="help">(optional, https)</span><input name="cover_url" type="url" inputmode="url" placeholder="https://…" value="${esc(c.cover_url || "")}"></label>
        <p class="ferr" role="alert" id="b-det-err"></p>
        <div class="row"><button class="btn or" type="submit" data-edit>Save details</button></div></form>`;
      $("#b-details").onsubmit = async e => {
        e.preventDefault(); const f = e.target, err = $("#b-det-err"); err.textContent = "";
        const patch = { title: f.title.value.trim(), summary: f.summary.value.trim(), description: f.description.value, level: f.level.value };
        if (patch.title.length < 3) { err.textContent = "Give the course a title (3+ characters)."; return; }
        const cv = f.cover_url.value.trim(); if (cv) { const v = C.linkVerdict(cv); if (v !== "ok") { err.textContent = C.VERDICT_MSG[v]; return; } patch.cover_url = cv; }
        const b = f.querySelector("[type=submit]"); busy(b, true);
        try { await C.update(courseId, patch); toast("Details saved."); await refresh(); } catch (x) { err.textContent = x.message; busy(b, false); }
      };
    }

    /* ---------- pricing ---------- */
    function renderPricing(p) {
      const c = tree.course, req = c.requested_price_ugx, paidReq = req != null && req > 0;
      const live = c.status === "published" ? (c.is_free ? "Free" : ugx(c.price_ugx)) : "Not live yet";
      p.innerHTML = `<form class="card ed" id="b-pricing" novalidate style="max-width:720px">
        <p><b>Live price:</b> ${esc(live)}${req != null ? ` · <b>Requested:</b> ${req ? esc(ugx(req)) : "Free"}${c.status === "published" && req !== c.price_ugx ? " (needs approval)" : ""}` : ""}</p>
        <div class="price-opts"><label><input type="radio" name="mode" value="free"${!paidReq ? " checked" : ""}>Free</label><label><input type="radio" name="mode" value="paid"${paidReq ? " checked" : ""}>Paid</label></div>
        <label class="field" id="b-pp"${paidReq ? "" : " hidden"}>Price you're asking for (UGX)<input name="price" type="number" min="1000" max="100000000" step="500" value="${paidReq ? req : ""}" placeholder="e.g. 25000"></label>
        <p class="help">Admins approve every price (and can make any course free). Your price takes effect when the course or its price change is approved. Payments run in test mode until the founder switches them on.</p>
        <p class="ferr" role="alert" id="b-pr-err"></p><div class="row"><button class="btn or" type="submit" data-edit>Save pricing</button></div></form>`;
      const f = $("#b-pricing");
      f.addEventListener("change", e => { if (e.target.name === "mode") $("#b-pp").hidden = f.mode.value !== "paid"; });
      f.onsubmit = async e => {
        e.preventDefault(); const err = $("#b-pr-err"); err.textContent = "";
        let pricing = { mode: "free" };
        if (f.mode.value === "paid") { const v = Math.round(+f.price.value); if (!(v >= 1000 && v <= 100000000)) { err.textContent = "Paid courses cost at least UGX 1,000."; return; } pricing = { mode: "paid", price_ugx: v }; }
        const b = f.querySelector("[type=submit]"); busy(b, true);
        try { await C.update(courseId, { pricing }); toast(pricing.mode === "free" ? "Set to free." : `Price request saved: ${ugx(pricing.price_ugx)}. An admin approves it with the course.`); await refresh(); } catch (x) { err.textContent = x.message; busy(b, false); }
      };
    }

    /* ---------- review & submit ---------- */
    function renderReview(p) {
      const list = C.checklist(tree), ok = list.every(x => x.ok), pending = subs().find(x => x.status === "pending");
      p.innerHTML = `<div class="grid g2" style="align-items:start">
        <div class="card ed"><div class="sec-title"><h2>BEFORE YOU SUBMIT</h2></div>
          <ul class="chk" id="b-check">${list.map(x => `<li class="${x.ok ? "ok" : "no"}" data-key="${x.key}">${esc(x.label)}${x.ok ? '<span class="sr-only"> (done)</span>' : '<span class="sr-only"> (to do)</span>'}</li>`).join("")}</ul>
          <label class="field">Note for the reviewer <span class="help">(optional)</span><textarea id="b-note" rows="3" maxlength="1000" style="min-height:80px;font-family:inherit" placeholder="Anything the reviewer should know"></textarea></label>
          <p class="ferr" role="alert" id="b-sub-err"></p>
          <div class="row">${pending ? `<span class="st review">In review since ${esc(D.fmtDate(pending.created_at, { day: "numeric", month: "short" }))}</span>` : `<button class="btn or" type="button" id="b-submit"${ok ? "" : " disabled"}>${ico("check")}Submit for review</button>`}
            <a class="btn" href="course.html?preview=${encodeURIComponent(courseId)}">${ico("play")}Preview first</a></div>
          ${ok || pending ? "" : `<p class="help">Finish the items above to submit. Admins check every course, its links and its price before it goes live.</p>`}</div>
        <div class="card"><div class="sec-title"><h2>REVIEW HISTORY</h2></div>${subs().length ? `<div class="hist">${subs().map(sb => { const st = sb.status === "pending" ? ["review", "In review"] : sb.status === "approved" ? ["approved", "Approved"] : sb.status === "rejected" ? ["rejected", "Rejected"] : ["draft", "Withdrawn"];
            return `<div class="dash-li"><div><b>${esc({ new: "New course", update: "Update", price: "Price change" }[sb.kind] || "Submission")}</b><small>${esc(D.fmtDate(sb.created_at, { day: "numeric", month: "short", year: "numeric" }))}${sb.requested_price_ugx ? " · asked " + esc(ugx(sb.requested_price_ugx)) : ""}${sb.approved_price_ugx != null && sb.status === "approved" ? " · approved at " + esc(sb.approved_price_ugx ? ugx(sb.approved_price_ugx) : "Free") : ""}</small>${sb.reason ? `<span class="st-reason">Reason: ${esc(sb.reason)}</span>` : ""}</div><span class="st ${st[0]}">${st[1]}</span></div>`; }).join("")}</div>`
          : empty({ key: "history", title: "Not submitted yet", body: "Each time you submit, the result (approved, or rejected with the reviewer's reason) shows here." })}</div></div>`;
      const sb = $("#b-submit");
      if (sb) sb.onclick = async () => { busy(sb, true); $("#b-sub-err").textContent = "";
        try { await C.submit(courseId, $("#b-note").value.trim() || undefined); toast("Submitted. An admin will review it; you'll get a notification with the result."); await refresh(); }
        catch (e) { $("#b-sub-err").textContent = e.message; busy(sb, false); } };
    }

    /* ---------- curriculum ---------- */
    function renderCurriculum(p) {
      const mods = tree.modules || [];
      if (sel && sel.type === "new-lesson" && !sel.moduleId && mods.length) sel.moduleId = mods[mods.length - 1].id;
      p.innerHTML = `<div class="bld"><div class="tree" id="b-tree" aria-label="Curriculum">${mods.length ? mods.map((m, mi) => modBlock(m, mi, mods.length)).join("") : ""}
          <form class="card ed" id="b-addmod" novalidate><label class="field">${mods.length ? "Add another module" : "Start with a module"} <span class="help">(a section of the course, e.g. "Getting started")</span><input name="title" maxlength="140" placeholder="Module ${mods.length + 1}: …" required></label>
            <button class="btn${mods.length ? "" : " or"}" type="submit" data-edit>${ico("plusc")}Add module</button><p class="ferr" role="alert" id="b-mod-err"></p></form></div>
        <div id="b-editor">${editorHtml()}</div></div>`;
      wireTree(); wireEditor();
    }
    function modBlock(m, mi, n) {
      const ls = m.lessons || [];
      return `<section class="mod" data-mod="${esc(m.id)}"><div class="mod-h"><small>M${mi + 1}</small><b title="${esc(m.title)}">${esc(m.title)}</b>
          <span class="mv"><button class="icon-btn sm" type="button" data-edit data-mmove="-1" aria-label="Move module up"${mi === 0 ? " disabled" : ""}>↑</button><button class="icon-btn sm" type="button" data-edit data-mmove="1" aria-label="Move module down"${mi === n - 1 ? " disabled" : ""}>↓</button>
          <button class="icon-btn sm" type="button" data-edit data-medit aria-label="Rename or delete module ${esc(m.title)}">${ico("gear")}</button></span></div>
        <ol>${ls.map((l, li) => `<li class="lrow" data-lid="${esc(l.id)}"><button type="button" class="les" data-les="${esc(l.id)}"${sel && sel.id === l.id ? ' aria-current="true"' : ""}><span class="kind" title="${esc(kindOf(l.kind).label)}">${ico(kindOf(l.kind).icon)}</span><span>${esc(l.title)}${l.is_preview ? ' <small class="muted">· free preview</small>' : ""}</span></button>
            <span class="mv"><button class="icon-btn sm" type="button" data-edit data-lmove="-1" aria-label="Move lesson ${esc(l.title)} up"${li === 0 ? " disabled" : ""}>↑</button><button class="icon-btn sm" type="button" data-edit data-lmove="1" aria-label="Move lesson ${esc(l.title)} down"${li === ls.length - 1 ? " disabled" : ""}>↓</button></span></li>`).join("") || `<li class="muted" style="padding:6px 8px">No lessons yet</li>`}</ol>
        <div class="add-les"><button class="btn sm or" type="button" data-edit data-addles>${ico("plusc")}Add lesson</button></div></section>`;
    }
    async function reorderMods(mid, d) {
      const ids = tree.modules.map(m => m.id), i = ids.indexOf(mid), j = i + d; if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      try { await C.reorder(courseId, ids, {}); await refresh(); } catch (e) { fail(e); }
    }
    async function moveLesson(lid, d) {
      const m = tree.modules.find(x => (x.lessons || []).some(l => l.id === lid)); if (!m) return;
      const ids = m.lessons.map(l => l.id), i = ids.indexOf(lid), j = i + d; if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      try { await C.reorder(courseId, tree.modules.map(x => x.id), { [m.id]: ids }); await refresh(); } catch (e) { fail(e); }
    }
    function wireTree() {
      const t = $("#b-tree");
      t.addEventListener("click", e => {
        const modEl = e.target.closest("[data-mod]"); const mid = modEl && modEl.dataset.mod;
        const lm = e.target.closest("[data-lmove]");
        if (lm) { if (lm.disabled || locked()) return; moveLesson(lm.closest("[data-lid]").dataset.lid, +lm.dataset.lmove); return; }
        const mm = e.target.closest("[data-mmove]"); if (mm) { reorderMods(mid, +mm.dataset.mmove); return; }
        if (e.target.closest("[data-medit]")) { sel = { type: "module", id: mid }; renderEditor(); return; }
        if (e.target.closest("[data-addles]")) { sel = { type: "new-lesson", moduleId: mid }; renderEditor(); setUrl({ id: courseId, tab: "curriculum", add: "lesson" }); return; }
        const lb = e.target.closest("[data-les]"); if (lb) { sel = { type: "lesson", id: lb.dataset.les }; t.querySelectorAll("[data-les]").forEach(x => x.toggleAttribute("aria-current", x === lb)); renderEditor(); }
      });
      $("#b-addmod").onsubmit = async e => {
        e.preventDefault(); const f = e.target, title = f.title.value.trim(), err = $("#b-mod-err"); err.textContent = "";
        if (title.length < 2) { err.textContent = "Give the module a title (2+ characters)."; f.title.focus(); return; }
        const b = f.querySelector("[type=submit]"); busy(b, true);
        try { const m = await C.addModule(courseId, { title }); toast("Module added."); if (sel && sel.type === "new-lesson" && !sel.moduleId) sel.moduleId = m.id; else sel = { type: "new-lesson", moduleId: m.id }; await refresh(); }
        catch (x) { err.textContent = x.message; busy(b, false); }
      };
    }
    function findLesson(lid) { for (const m of tree.modules || []) for (const l of m.lessons || []) if (l.id === lid) return [m, l]; return [null, null]; }
    function renderEditor() { $("#b-editor").innerHTML = editorHtml(); wireEditor(); if (locked()) $("#b-editor").querySelectorAll("input,textarea,select,button[data-edit]").forEach(el => el.disabled = true); }
    function editorHtml() {
      const mods = tree.modules || [];
      if (!sel) return mods.length
        ? `<div class="card">${empty({ key: "editor", title: "Pick a lesson to edit, or add one", body: "Each module holds lessons: a YouTube video, a book, text, a file or a quiz. Use ↑ ↓ to change the order." })}</div>`
        : `<div class="card">${empty({ key: "editor", examples: [["M1 · Getting started", "3 lessons"], ["M2 · Your first project", "5 lessons"]], title: "Add your first module", body: "Modules are the sections of your course. Add one on the left, then fill it with lessons." })}</div>`;
      if (sel.type === "module") {
        const m = mods.find(x => x.id === sel.id); if (!m) { sel = null; return editorHtml(); }
        return `<form class="card ed" id="b-modform" novalidate><div class="sec-title"><h2>MODULE</h2></div>
          <label class="field">Title<input name="title" maxlength="140" value="${esc(m.title)}" required></label>
          <label class="field">Summary <span class="help">(optional)</span><textarea name="summary" rows="3" maxlength="1000" style="min-height:80px;font-family:inherit">${esc(m.summary || "")}</textarea></label>
          <p class="ferr" role="alert" id="b-mf-err"></p>
          <div class="row"><button class="btn or" type="submit" data-edit>Save module</button><button class="btn no" type="button" data-edit id="b-moddel">Delete module and its ${num((m.lessons || []).length)} lessons</button></div></form>`;
      }
      if (sel.type === "new-lesson" && !mods.length) return `<div class="card">${empty({ key: "need-module", title: "Add a module first", body: "Lessons sit inside modules. Give your first module a title on the left (for example \u201cGetting started\u201d) and the lesson editor opens." })}</div>`;
      const editing = sel.type === "lesson" ? findLesson(sel.id)[1] : null;
      if (sel.type === "lesson" && !editing) { sel = null; return editorHtml(); }
      const kind = (editing && editing.kind) || sel.kind || null;
      const modSel = `<label class="field">Module<select name="module_id"${editing ? " disabled" : ""}>${mods.map(m => `<option value="${esc(m.id)}"${(editing ? editing.module_id : sel.moduleId) === m.id ? " selected" : ""}>${esc(m.title)}</option>`).join("")}</select></label>`;
      return `<form class="card ed" id="b-lesform" novalidate><div class="sec-title"><h2>${editing ? "EDIT LESSON" : "NEW LESSON"}</h2>${editing ? `<a class="viewall" href="course.html?preview=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(editing.id)}">Preview lesson →</a>` : ""}</div>
        <div class="kind-pick" role="group" aria-label="Lesson type">${KINDS.map(k => `<button type="button" data-edit data-kind="${k.k}" aria-pressed="${kind === k.k}">${ico(k.icon)}<span>${k.label}</span></button>`).join("")}</div>
        ${kind ? `${modSel}<label class="field">Lesson title<input name="title" maxlength="140" required value="${esc(editing ? editing.title : "")}" placeholder="e.g. Variables and types"></label>
          ${kindFields(kind, editing)}
          <label class="row" style="gap:8px;font-weight:700"><input type="checkbox" name="is_preview"${editing && editing.is_preview ? " checked" : ""} style="width:20px;height:20px;accent-color:var(--accent)">Free preview <span class="help">(anyone can watch this lesson before enrolling)</span></label>
          <p class="ferr" role="alert" id="b-les-err"></p>
          <div class="row"><button class="btn or" type="submit" data-edit>${editing ? "Save lesson" : "Add lesson"}</button>${editing ? `<button class="btn no" type="button" data-edit id="b-lesdel">Delete lesson</button>` : `<button class="btn" type="button" id="b-lescancel">Cancel</button>`}</div>`
        : `<p class="help">Pick what this lesson is. You can mix types inside a module.</p>`}</form>`;
    }
    function kindFields(kind, l) {
      const p = (l && l.payload) || {};
      if (kind === "video") return `<label class="field">YouTube link or video id<input name="youtube" inputmode="url" required value="${esc(p.youtube_id ? "https://www.youtube.com/watch?v=" + p.youtube_id : "")}" placeholder="https://www.youtube.com/watch?v=…"><span class="help">Plays in privacy-enhanced mode (youtube-nocookie.com). Only link videos you're allowed to share.</span></label>
        <div class="row"><button class="btn sm" type="button" id="b-ytprev">${ico("play")}Preview video</button></div><div id="b-ytbox" class="prev-box" hidden></div>
        <label class="field">Notes under the video <span class="help">(optional, Markdown)</span><textarea name="note" rows="4">${esc((l && l.content_md) || "")}</textarea></label>`;
      if (kind === "book") return `<label class="field">ISBN <span class="help">(10 or 13 digits; we check the check digit)</span><input name="isbn" inputmode="numeric" value="${esc(p.isbn || "")}" placeholder="9781593279509"></label>
        <div class="row"><button class="btn sm" type="button" id="b-bkfind">${ico("search")}Look up on Open Library</button></div><div id="b-bkbox" class="prev-box" hidden></div>
        <label class="field">Or a link to the book <span class="help">(open textbook, publisher page; https)</span><input name="url" type="url" inputmode="url" value="${esc(p.url || "")}" placeholder="https://openstax.org/…"></label>
        <input type="hidden" name="book_title" value="${esc(p.book_title || "")}"><input type="hidden" name="author" value="${esc(p.author || "")}"><input type="hidden" name="cover" value="${esc(p.cover || "")}">
        <label class="field">What to read and why <span class="help">(optional, Markdown)</span><textarea name="note" rows="4">${esc((l && l.content_md) || "")}</textarea></label>`;
      if (kind === "text") return `<label class="field">Lesson text <span class="help">(Markdown: # heading, **bold**, *italic*, - lists, \`code\`, [links](https://…))</span><textarea name="content_md" rows="12" required>${esc((l && l.content_md) || "")}</textarea></label>
        <div class="prev-box"><small class="help">Preview</small><div class="md" id="b-mdprev">${C.md((l && l.content_md) || "")}</div></div>`;
      if (kind === "file") return `<label class="field">Link to the file <span class="help">(https: Google Drive, OneDrive, GitHub, Dropbox…; set it to "anyone with the link can view")</span><input name="url" type="url" inputmode="url" required value="${esc(p.url || "")}" placeholder="https://drive.google.com/…"></label>
        <label class="field">File name <span class="help">(optional)</span><input name="file_name" maxlength="200" value="${esc(p.file_name || "")}" placeholder="worksheet-week1.pdf"></label>
        <label class="field">What's in it <span class="help">(optional, Markdown)</span><textarea name="note" rows="4">${esc((l && l.content_md) || "")}</textarea></label>`;
      if (kind === "quiz") { const qs = p.questions ? p.questions.map((x, i) => ({ q: x.q, options: x.options, answer: l.answers ? l.answers[i] : -1 })) : [{ q: "", options: ["", ""], answer: -1 }];
        return `<div class="qz" id="b-qz">${qs.map(qBlock).join("")}</div><div class="row"><button class="btn sm" type="button" data-edit id="b-qadd">${ico("plusc")}Add question</button></div>
          <p class="help">Answers are stored separately and never sent to learners' browsers; quizzes are marked on the server.</p>`; }
      return "";
    }
    function qBlock(x, i) {
      return `<fieldset data-q="${i}"><legend>Question ${i + 1}</legend><label class="field"><span class="sr-only">Question ${i + 1}</span><input data-qtext value="${esc(x.q)}" placeholder="Type the question" maxlength="500"></label>
        ${x.options.map((o, j) => `<div class="opt"><input type="radio" name="ans-${i}" value="${j}" aria-label="Option ${j + 1} is correct"${x.answer === j ? " checked" : ""}><input data-opt value="${esc(o)}" placeholder="Option ${j + 1}" maxlength="200" aria-label="Option ${j + 1}"><button class="icon-btn sm" type="button" data-edit data-optdel aria-label="Remove option ${j + 1}"${x.options.length <= 2 ? " disabled" : ""}>${ico("xmark")}</button></div>`).join("")}
        <div class="row"><button class="btn sm" type="button" data-edit data-optadd${x.options.length >= 6 ? " disabled" : ""}>Add option</button><button class="btn sm no" type="button" data-edit data-qdel>Remove question</button><span class="help">Tick the correct option.</span></div></fieldset>`;
    }
    function readQuiz() {
      return [...document.querySelectorAll("#b-qz [data-q]")].map(fs => { const opts = [...fs.querySelectorAll("[data-opt]")].map(i => i.value); const r = fs.querySelector("input[type=radio]:checked");
        return { q: fs.querySelector("[data-qtext]").value, options: opts, answer: r ? +r.value : -1 }; });
    }
    function wireEditor() {
      const f = $("#b-lesform");
      const mf = $("#b-modform");
      if (mf) {
        mf.onsubmit = async e => { e.preventDefault(); const t = mf.title.value.trim(); if (t.length < 2) { $("#b-mf-err").textContent = "Give the module a title (2+ characters)."; return; }
          try { await C.updateModule(sel.id, { title: t, summary: mf.summary.value.trim() }); toast("Module saved."); await refresh(); } catch (x) { $("#b-mf-err").textContent = x.message; } };
        $("#b-moddel").onclick = async () => { if (!confirm("Delete this module and all its lessons? This can't be undone.")) return;
          try { await C.removeModule(sel.id); sel = null; toast("Module deleted."); await refresh(); } catch (x) { fail(x); } };
      }
      if (!f) return;
      f.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => {
        if (sel.type === "lesson") { const [, l] = findLesson(sel.id); if (l && l.kind !== b.dataset.kind && !confirm("Change this lesson's type? Its current content will be replaced when you save.")) return; if (l) { l.kind = b.dataset.kind; l.payload = {}; l.content_md = l.kind === "text" ? l.content_md : null; } }
        else { const mid = f.module_id ? f.module_id.value : sel.moduleId; sel = { type: "new-lesson", moduleId: mid, kind: b.dataset.kind }; }
        renderEditor(); const t = $("#b-lesform [name=title]"); if (t) t.focus();
      });
      const cancel = $("#b-lescancel"); if (cancel) cancel.onclick = () => { sel = null; setUrl({ id: courseId, tab: "curriculum" }); renderEditor(); };
      const md = f.content_md; if (md) md.oninput = () => { $("#b-mdprev").innerHTML = C.md(md.value); };
      const yt = $("#b-ytprev"); if (yt) yt.onclick = async () => { const id = C.youtubeId(f.youtube.value), box = $("#b-ytbox"); box.hidden = false;
        if (!id) { box.innerHTML = `<p class="ferr">That doesn't look like a YouTube link or id.</p>`; return; }
        box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1" title="Video preview" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
        if (!f.title.value.trim() && window.CC_API && window.CC_API.fetchYouTubePreview) { try { const v = await window.CC_API.fetchYouTubePreview(id); if (v && v.title && !/^YouTube video /.test(v.title)) f.title.value = v.title.slice(0, 140); } catch (e) {} } };
      const bk = $("#b-bkfind"); if (bk) bk.onclick = async () => { const box = $("#b-bkbox"); box.hidden = false; const raw = f.isbn.value.trim();
        if (!raw) { box.innerHTML = `<p class="ferr">Type an ISBN first.</p>`; return; }
        const i = C.isbn(raw); if (!i) { box.innerHTML = `<p class="ferr">That ISBN's check digit is wrong.</p>`; return; }
        box.innerHTML = `<p class="muted">Looking it up…</p>`;
        const b = window.CC_API && window.CC_API.fetchBookPreview ? await window.CC_API.fetchBookPreview(i).catch(() => null) : null;
        if (!b) { box.innerHTML = `<p class="muted">Open Library has no record for ${esc(i)}. You can still save it with the ISBN, or add a link.</p>`; return; }
        f.book_title.value = b.title || ""; f.author.value = b.author || ""; f.cover.value = b.cover || "";
        if (!f.title.value.trim()) f.title.value = ("Read: " + (b.title || "")).slice(0, 140);
        box.innerHTML = `<div class="book-card">${b.cover ? `<img src="${esc(b.cover)}" alt="" width="96" height="144" loading="lazy" onerror="this.remove()">` : ""}<div><b>${esc(b.title)}</b><p class="muted">${esc(b.author || "")}</p><small class="help">Found on Open Library</small></div></div>`; };
      const qz = $("#b-qz");
      if (qz) {
        const redraw = qs => { qz.innerHTML = qs.map(qBlock).join(""); };
        qz.addEventListener("click", e => { const fs = e.target.closest("[data-q]"); if (!fs) return; const qs = readQuiz(), i = +fs.dataset.q;
          if (e.target.closest("[data-optadd]")) { if (qs[i].options.length < 6) qs[i].options.push(""); redraw(qs); }
          else if (e.target.closest("[data-optdel]")) { const j = [...fs.querySelectorAll("[data-optdel]")].indexOf(e.target.closest("[data-optdel]")); qs[i].options.splice(j, 1); if (qs[i].answer === j) qs[i].answer = -1; else if (qs[i].answer > j) qs[i].answer--; redraw(qs); }
          else if (e.target.closest("[data-qdel]")) { qs.splice(i, 1); if (!qs.length) qs.push({ q: "", options: ["", ""], answer: -1 }); redraw(qs); } });
        $("#b-qadd").onclick = () => { const qs = readQuiz(); if (qs.length >= 50) return; qs.push({ q: "", options: ["", ""], answer: -1 }); redraw(qs); const last = qz.querySelector("[data-q]:last-child [data-qtext]"); if (last) last.focus(); };
      }
      const del = $("#b-lesdel"); if (del) del.onclick = async () => { if (!confirm("Delete this lesson? This can't be undone.")) return;
        try { await C.removeLesson(sel.id); sel = null; toast("Lesson deleted."); await refresh(); } catch (x) { fail(x); } };
      f.onsubmit = async e => {
        e.preventDefault(); const err = $("#b-les-err"); err.textContent = "";
        const kind = (f.querySelector("[data-kind][aria-pressed=true]") || {}).dataset; if (!kind) { err.textContent = "Pick a lesson type."; return; }
        const form = { kind: kind.kind, title: f.title.value, is_preview: f.is_preview.checked };
        ["youtube", "isbn", "url", "note", "content_md", "file_name", "book_title", "author", "cover"].forEach(n => { if (f[n]) form[n] = f[n].value.trim() || undefined; });
        if (form.content_md === undefined && f.content_md) form.content_md = "";
        if (kind.kind === "quiz") form.questions = readQuiz();
        const v = C.lessonRow(form);
        if (!v.ok) { err.textContent = v.error; const el = f[v.field]; if (el && el.focus) el.focus(); return; }
        const b = f.querySelector("[type=submit]"); busy(b, true);
        try {
          if (sel.type === "lesson") { await C.updateLesson(sel.id, v.row); toast("Lesson saved."); }
          else { const mid = f.module_id.value; const l = await C.addLesson(mid, v.row); sel = { type: "lesson", id: l.id }; toast("Lesson added."); setUrl({ id: courseId, tab: "curriculum" }); }
          await refresh();
        } catch (x) { err.textContent = x.message; busy(b, false); }
      };
    }

    render();
  }
})();
