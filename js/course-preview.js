/* Course player PREVIEW (round 11): course.html?preview=<courseId>[&lesson=<id>][&submission=<id>]
   - Tutors preview their own course, drafts included (CCCourses: API or this device).
   - Admins preview exactly what was submitted (GET /api/v1/admin/course-submissions/:id → snapshot).
   Renders every lesson kind in the real player: video (youtube-nocookie, click to load), book, Markdown text, file link,
   quiz (marked by the server; in this-device mode the tutor's own key is used locally). Learners never reach this mode:
   the course.preview action is tutor/admin only, and the server only returns drafts to their owner or an admin. */
(async function () {
  const q = new URLSearchParams(location.search);
  if (!q.has("preview")) return;
  const D = window.CCDash, C = window.CCCourses; if (!D || !C) return;
  const { $, esc, ico, ugx, num } = D;
  const main = $("#main");
  const A = await D.access();
  const courseId = q.get("preview"), subId = q.get("submission");
  const staff = A.role === "admin" || A.role === "root_admin";
  const fail = (title, body, href, label) => { main.innerHTML = `<div class="card">${D.empty({ key: "preview", title, body, action: { href, label } })}</div>`; };
  if (!(A.can && A.can("course.preview"))) { fail("Preview is for the course's tutor", "Learners see courses once an admin approves them.", "courses.html", "Browse courses"); return; }

  let tree;
  try {
    if (staff) {
      if (!subId) { fail("Open previews from the approvals queue", "Each submission in the admin console has a Preview button that shows exactly what the tutor submitted.", "admin.html#approvals", "Go to approvals"); return; }
      const r = await D.getJSON("/admin/course-submissions/" + encodeURIComponent(subId));
      if (r.state !== "ok") { fail("Couldn't load that submission", r.message || "The server didn't answer.", "admin.html#approvals", "Back to approvals"); return; }
      tree = r.data.snapshot || {}; tree.submissions = [r.data];
    } else tree = await C.get(courseId);
  } catch (e) { fail("Couldn't open the preview", e.message, "builder.html", "Back to the builder"); return; }

  const course = tree.course || {};
  const mods = (tree.modules || []).slice().sort((a, b) => a.position - b.position);
  if ((tree.legacy_lessons || []).length) mods.push({ id: "legacy", title: "More lessons", lessons: tree.legacy_lessons });
  const flat = []; mods.forEach((m, mi) => (m.lessons || []).forEach(l => flat.push({ l, m, mi })));
  const status = C.statusOf(course, tree.submissions || []);
  // r11 integrate: same rule as the DB (app.can_view_lesson): on Free, the first lessons.free_per_course lessons plus every
  // "Free preview" lesson are open; a per-lesson min_plan above free locks it. Default from the policy's learner Free row.
  const POL = (window.CCAccess && CCAccess.policy) || {};
  const freeN = (((POL.limits || {}).learner || {}).free || {})["lessons.free_per_course"];
  const freeFirst = typeof freeN === "number" ? freeN : 3;

  /* preview bar */
  const back = staff ? `<a class="btn sm" href="admin.html#approvals">Back to approvals</a>` : `<a class="btn sm" href="builder.html?id=${encodeURIComponent(courseId)}&tab=curriculum">Back to builder</a>`;
  main.insertAdjacentHTML("afterbegin", `<div class="pv-bar" role="status">${ico("play")}<span>PREVIEW — ${status.key === "approved" ? "this is the live course plus any unapproved changes" : "learners can't see this yet"}</span><span class="st ${status.key}" style="color:var(--on-inverse)">${esc(status.label)}</span><span class="sp"></span>${C.mode === "local" ? `<small>Saved on this device</small>` : ""}${back}</div>`);
  document.title = "Preview · " + (course.title || "Course") + " · 101 Codecrafts";

  $("#c-path").textContent = "Course preview";
  $("#c-title").textContent = String(course.title || "Untitled course").toUpperCase();
  const price = course.status === "published" ? (course.is_free ? "Free" : ugx(course.price_ugx)) : (course.requested_price_ugx ? "Asking " + ugx(course.requested_price_ugx) : "Free");
  $("#c-meta").innerHTML = `<span class="tagx">${esc((course.level || "beginner").replace(/^./, s => s.toUpperCase()))}</span><span class="tagx">${num(mods.length)} modules</span><span class="tagx">${num(flat.length)} lessons</span><span class="tagx">${esc(price)}</span>`;
  // preview shows lesson content in Overview; notes/books/discussion belong to enrolled learners
  const tabs = document.querySelector("[role=tablist]"); if (tabs) { tabs.hidden = true; tabs.style.display = "none"; }
  ["#p-no", "#p-bk", "#p-di"].forEach(s => { const el = $(s); if (el) el.hidden = true; });
  const done = $("#c-done"); if (done) { done.disabled = true; done.title = "Learners mark lessons complete"; done.lastChild.textContent = "Learners mark complete"; }

  if (!flat.length) {
    $("#c-lessons").innerHTML = `<li class="muted" style="padding:8px">No lessons yet</li>`;
    $("#c-video").innerHTML = `<div class="facade"><div class="thumb-ph">${ico("clipboard")}</div><span class="play-lbl">Add a lesson in the builder to preview it here</span></div>`;
    $("#c-ltitle").textContent = "No lessons yet"; $("#c-next").disabled = true; $("#c-pct").textContent = "";
    $("#p-ov").innerHTML = D.empty({ key: "pv-empty", title: "Nothing to preview yet", body: "Add modules and lessons, then come back.", action: { href: `builder.html?id=${encodeURIComponent(courseId)}&tab=curriculum&add=lesson`, label: "Add a lesson" } });
    return;
  }
  let cur = Math.max(0, flat.findIndex(x => x.l.id === q.get("lesson")));
  const kindIcon = { video: "yt", book: "openbook", text: "doc", file: "download", quiz: "clipboard" };

  function list() {
    let html = "", lastMod = null;
    flat.forEach((x, i) => {
      if (x.m !== lastMod) { html += `<li class="pv-mod">M${x.mi + 1} · ${esc(x.m.title)}</li>`; lastMod = x.m; }
      const locked = !x.l.is_preview && (i >= freeFirst || (x.l.min_plan && x.l.min_plan !== "free"));
      html += `<li><a href="?preview=${encodeURIComponent(courseId)}${subId ? "&submission=" + encodeURIComponent(subId) : ""}&lesson=${encodeURIComponent(x.l.id)}" data-i="${i}"${i === cur ? ' aria-current="true"' : ""}><span class="tick" role="img" aria-label="${esc(x.l.kind)} lesson">${ico(kindIcon[x.l.kind] || "doc")}</span><span>${esc(x.l.title)}${x.l.is_preview ? ' <small class="muted">· free preview</small>' : locked ? ` <small class="lock" title="Locked for Free-plan learners">${ico("lock")}</small>` : ""}${x.l.approved === false && status.key === "approved" ? ' <small class="muted">· not yet approved</small>' : ""}</span></a></li>`;
    });
    $("#c-lessons").innerHTML = html;
    $("#c-pct").textContent = `First ${freeFirst} lesson(s) + ${flat.filter(x => x.l.is_preview).length} free-preview lesson(s) open on Free · the rest unlock on a paid plan or when the course is bought`;
  }
  function stage(l) {
    const p = l.payload || {};
    if (l.kind === "video" && p.youtube_id) {
      const th = `https://i.ytimg.com/vi/${p.youtube_id}/hqdefault.jpg`;
      $("#c-video").innerHTML = `<button class="facade" type="button" aria-label="Play video: ${esc(l.title)}"><img src="${th}" alt="" loading="lazy" decoding="async"><span class="play">▶</span><span class="play-lbl">Play lesson</span></button>`;
      $("#c-video .facade").onclick = () => { $("#c-video").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${p.youtube_id}?autoplay=1&rel=0&modestbranding=1" title="${esc(l.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`; };
      return;
    }
    const label = { book: "Reading", text: "Reading", file: "Download", quiz: "Quiz" }[l.kind] || "Lesson";
    $("#c-video").innerHTML = `<div class="facade"><div class="thumb-ph">${ico(kindIcon[l.kind] || "doc")}</div><span class="play-lbl">${esc(label)} · no video</span></div>`;
  }
  function body(l) {
    const p = l.payload || {}, note = l.content_md ? `<div class="md">${C.md(l.content_md)}</div>` : "";
    if (l.kind === "text") return `<div class="md">${C.md(l.content_md || "")}</div>`;
    if (l.kind === "video") return note || `<p class="muted">Videos play from YouTube in privacy-enhanced mode.</p>`;
    if (l.kind === "book") {
      const cover = p.cover || (p.isbn ? `https://covers.openlibrary.org/b/isbn/${p.isbn}-M.jpg` : "");
      const link = p.url && C.linkVerdict(p.url) === "ok" ? p.url : p.isbn ? `https://openlibrary.org/isbn/${p.isbn}` : "";
      return `<div class="book-card">${cover ? `<img src="${esc(cover)}" alt="" width="96" height="144" loading="lazy" onerror="this.remove()">` : ""}<div><b>${esc(p.book_title || l.title)}</b>${p.author ? `<p class="muted">${esc(p.author)}</p>` : ""}${p.isbn ? `<p class="muted">ISBN ${esc(p.isbn)}</p>` : ""}
        ${link ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer nofollow">${ico("openbook")}Open the book<span class="sr-only"> (opens in a new tab)</span></a>` : ""}</div></div>${note}`;
    }
    if (l.kind === "file") {
      const ok = C.linkVerdict(p.url) === "ok", host = ok ? new URL(p.url).hostname.replace(/^www\./, "") : "";
      return `<div class="dash-li" style="grid-template-columns:auto 1fr auto"><span class="kind">${ico("download")}</span><div><b>${esc(p.file_name || l.title)}</b><small>${esc(host)}</small></div>${ok ? `<a class="btn sm or" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer nofollow">Open file<span class="sr-only"> (opens ${esc(host)} in a new tab)</span></a>` : `<span class="ferr">Unsafe link</span>`}</div>${note}`;
    }
    if (l.kind === "quiz") {
      const qs = p.questions || [];
      return `<form class="qz-run" id="pv-quiz">${qs.map((x, i) => `<fieldset class="q"><legend><b>${i + 1}. ${esc(x.q)}</b></legend>${x.options.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}">${esc(o)}</label>`).join("")}<span data-res="${i}"></span></fieldset>`).join("")}
        <div class="row"><button class="btn or" type="submit">Check answers</button><span id="pv-score" role="status"></span></div></form>`;
    }
    return note;
  }
  function wireQuiz(l) {
    const f = $("#pv-quiz"); if (!f) return;
    f.onsubmit = async e => {
      e.preventDefault();
      const n = (l.payload.questions || []).length, answers = Array.from({ length: n }, (_, i) => { const r = f.querySelector(`input[name=q${i}]:checked`); return r ? +r.value : null; });
      let res;
      try {
        if (staff) {   // admins grade through the API directly (their builder adapter is not used here)
          const h = { "Content-Type": "application/json", Accept: "application/json" };
          try { const c = window.CC_AUTH && window.CC_AUTH.clerk; const t = c && c.session && await c.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e2) {}
          const r = await fetch("/api/v1/lessons/" + encodeURIComponent(l.id) + "/quiz", { method: "POST", credentials: "include", headers: h, body: JSON.stringify({ answers }) });
          const j = await r.json().catch(() => null); res = r.ok && j ? j.data : null;
        } else res = await C.gradeQuiz(l.id, answers);
      }
      catch (x) { $("#pv-score").textContent = x.message; return; }
      if (!res) { $("#pv-score").textContent = "Quiz marking needs the server."; return; }
      res.correct.forEach((ok, i) => { const s = f.querySelector(`[data-res="${i}"]`); if (s) { s.className = ok ? "good" : "bad"; s.textContent = ok ? "✓ Correct" : "✗ Not quite"; } });
      const pass = Math.round(res.score / Math.max(1, res.total) * 100) >= ((l.payload && l.payload.pass_pct) || 70);
      $("#pv-score").innerHTML = `<b>${res.score} / ${res.total}</b> ${pass ? '<span class="good">Pass</span>' : '<span class="bad">Try again</span>'}`;
    };
  }
  function show() {
    const x = flat[cur], l = x.l;
    $("#c-ltitle").textContent = `${cur + 1}. ${l.title}`;
    stage(l); list();
    $("#p-ov").hidden = false;
    $("#p-ov").innerHTML = body(l) + `<p class="muted" style="margin-top:10px">Lesson ${cur + 1} of ${flat.length} · module ${x.mi + 1}: ${esc(x.m.title)}</p>`;
    wireQuiz(l);
    $("#c-next").disabled = cur === flat.length - 1;
    const u = new URL(location.href); u.searchParams.set("lesson", l.id); history.replaceState(null, "", u.pathname + u.search);
  }
  $("#c-lessons").addEventListener("click", e => { const a = e.target.closest("[data-i]"); if (!a) return; e.preventDefault(); cur = +a.dataset.i; show(); });
  $("#c-next").onclick = () => { if (cur < flat.length - 1) { cur++; show(); } };
  show();
})();
