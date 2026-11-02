/* Tutor view — data from CC_API.fetchTutorOverview(), payout requests via CC_API.requestPayout() */
(async function () {
  const { $, esc, ugx } = window.CC_UI, API = window.CC_API;
  const t = await API.fetchTutorOverview(); const cls = ["or", "", "ink", "cy"];
  $("#t-kpis").innerHTML = t.kpis.map((k, i) => `<div class="kpi ${cls[i]}"><small>${esc(k.label)}</small><b>${k.money ? ugx(k.value) : esc(k.value)}</b></div>`).join("");
  $("#tb-tc tbody").innerHTML = t.courses.map(c => `<tr><td><b>${esc(c.title)}</b></td><td>${c.learners}</td><td><span class="pill ${c.status.split(" ")[0]}">${esc(c.status)}</span></td><td>${c.completion ? c.completion + "%" : "—"}</td></tr>`).join("");
  $("#tb-tl tbody").innerHTML = t.learners.map(l => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.course)}</td><td><div class="row" style="flex-wrap:nowrap"><div class="prog" style="flex:1" role="progressbar" aria-valuenow="${l.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(l.name)} progress"><i style="width:${l.progress}%"></i></div><b>${l.progress}%</b></div></td><td>${esc(l.last)}</td></tr>`).join("");
  $("#ls-sessions").innerHTML = t.sessions.map(s => `<div class="li"><span class="date"><span>${s.m}<br><b>${s.d}</b></span></span><div class="grow"><b>${esc(s.title)}</b><small>${esc(s.meta)}</small></div></div>`).join("");
  $("#ls-payouts").innerHTML = t.payouts.map(p => `<div class="li"><div class="grow"><b>${ugx(p.amount)}</b><small>${esc(p.method)} · requested ${esc(p.requested)}</small></div><span class="pill ${p.status}">${esc(p.status)}</span></div>`).join("");
  $("#payout-form").onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const r = await API.requestPayout(+f.amount, f.method); $("#payout-msg").textContent = r ? "Payout requested." : `Request for ${ugx(+f.amount)} via ${f.method} saved — the payouts backend is not connected yet.`; };
  $("#new-course").onclick = () => alert("Course builder opens here (POST /api/tutor/courses). Courses go to admin approval before publishing.");
  /* ---- add YouTube lesson / book with live preview ---- */
  $("#yt-form").onsubmit = async e => { e.preventDefault(); const f = e.target; const v = await API.fetchYouTubePreview(f.url.value.trim()); const box = $("#yt-prev"); box.hidden = false;
    if (!v) { box.innerHTML = `<p class="vbad">That doesn't look like a YouTube link.</p>`; return; }
    box.innerHTML = `<div class="li"><img src="${esc(v.thumb)}" alt="" width="160" height="90" style="object-fit:cover;border:2px solid var(--ink)" onerror="this.remove()"><div class="grow"><b>${esc(v.title)}</b><small>${esc(v.author || "YouTube")} · id ${esc(v.id)}</small></div></div>
      <label class="field" style="margin-top:8px">Lesson title<input id="yt-title" value="${esc(v.title)}"></label><button class="btn ink" id="yt-add" style="margin-top:8px">Add to course</button><p role="status" id="yt-msg"></p>`;
    $("#yt-add").onclick = async () => { const r = await API.addLessonVideo(f.course.value, { title: $("#yt-title").value, yt: v.id }); $("#yt-msg").textContent = r ? "Lesson added." : "Saved as draft — POST /api/tutor/courses/:id/lessons is not connected yet."; }; };
  $("#bk-form").onsubmit = async e => { e.preventDefault(); const f = e.target; const box = $("#bk-prev"); box.hidden = false; box.innerHTML = "<p class='muted'>Looking up Open Library…</p>";
    let b = await API.fetchBookPreview(f.q.value.trim()); if (!b && f.url.value) b = { title: f.q.value, author: "", cover: "", url: f.url.value, site: new URL(f.url.value).hostname };
    if (!b) { box.innerHTML = `<p class="vbad">No match found. Paste a direct link instead.</p>`; return; }
    box.innerHTML = `<div class="li">${b.cover ? `<img src="${esc(b.cover)}" alt="" width="64" height="96" style="object-fit:cover;border:2px solid var(--ink)">` : ""}<div class="grow"><b>${esc(b.title)}</b><small>${esc(b.author)} · ${esc(b.site)}</small></div><button class="btn ink sm" id="bk-add">Add</button></div><p role="status" id="bk-msg"></p>`;
    $("#bk-add").onclick = async () => { const r = await API.addCourseBook("web-basics", b); $("#bk-msg").textContent = r ? "Book added." : "Saved as draft — the books endpoint is not connected yet."; }; };
})();
