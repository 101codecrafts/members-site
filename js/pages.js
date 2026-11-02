/* Renderers for the member pages (library, news, launchpad, product, testing, competitions, groups, projects,
   profile, verify, auth/onboarding, go). Each reads data only through CC_API. */
(function () {
  const { $, $$, esc, ugx, ico } = window.CC_UI, API = window.CC_API, D = window.CC_DATA;
  const page = document.body.dataset.page, q = new URLSearchParams(location.search);
  const LV_CLR = { Primary: "#13a35c", "O-Level": "#1b8acb", "A-Level": "#7a3fb0", University: "#a85400", Professional: "#10181f" };
  const levelBadge = l => l ? `<span class="lvl" style="--lv:${LV_CLR[l] || "#10181f"}">${esc(l)}</span>` : "";
  const avatars = arr => `<span class="avs">${arr.map(a => `<i aria-hidden="true">${esc(a)}</i>`).join("")}</span>`;
  const toast = m => { let t = $("#cc-toast"); if (!t) { t = document.createElement("div"); t.id = "cc-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = m; t.className = "show"; clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 2600); };
  /* education-level filter chips: <div data-levels></div> */
  function levelChips(onChange) {
    const host = $("[data-levels]"); if (!host) return;
    host.setAttribute("role", "group"); host.setAttribute("aria-label", "Education level");
    host.innerHTML = [""].concat(D.levels).map(l => `<button type="button" class="chip" aria-pressed="${!l}" data-lv="${l}">${l || "All levels"}</button>`).join("");
    host.addEventListener("click", e => { const b = e.target.closest("[data-lv]"); if (!b) return; $$("[data-lv]", host).forEach(x => x.setAttribute("aria-pressed", x === b)); onChange(b.dataset.lv); });
  }
  const countdown = iso => { const ms = Date.parse(iso) - Date.now(); if (ms <= 0) return "Started"; const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return `${d}d ${h}h ${m}m`; };
  window.CC_UI.levelBadge = levelBadge;

  const R = {
    /* ---------------- Library ---------------- */
    async resources() {
      const all = await API.fetchResources(); const st = { type: "", path: "", level: "", q: "" };
      $("#f-type").innerHTML = ["", "Course", "Book", "Video", "Article", "Repo"].map(t => `<button type="button" class="chip" aria-pressed="${!t}" data-t="${t}">${t || "All types"}</button>`).join("");
      $("#f-path").innerHTML = `<option value="">All learning paths</option>` + D.paths.map(p => `<option>${esc(p)}</option>`).join("");
      const draw = () => { const r = all.filter(x => (!st.type || x.type === st.type) && (!st.path || x.path === st.path) && (!st.level || x.level === st.level) && (!st.q || (x.title + x.desc + x.site + (x.tags || []).join(" ")).toLowerCase().includes(st.q)));
        $("#res-grid").innerHTML = r.map(x => window.CC_UI.resourceCard(x).replace('<div class="rbody">', `<div class="rbody">${levelBadge(x.level)}`)).join("") || `<p class="muted">Nothing matches yet — try another filter.</p>`; $("#res-count").textContent = r.length + " resources"; };
      $("#f-type").onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; $$("[data-t]").forEach(x => x.setAttribute("aria-pressed", x === b)); st.type = b.dataset.t; draw(); };
      $("#f-path").onchange = e => { st.path = e.target.value; draw(); };
      $("#f-q").oninput = e => { st.q = e.target.value.trim().toLowerCase(); draw(); };
      levelChips(l => { st.level = l; draw(); }); draw();
    },
    /* ---------------- News ---------------- */
    async news() {
      $("#news-date").textContent = "Today · " + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const all = await API.fetchNews(); let cat = "";
      $("#news-cats").innerHTML = ["", "AI", "Africa Tech", "Dev", "Security", "Cloud", "Startups", "Jobs"].map(c => `<button type="button" class="chip" aria-pressed="${!c}" data-c="${c}">${c || "All"}</button>`).join("");
      const draw = () => { const r = all.filter(n => !cat || n.cat === cat); $("#news-grid").innerHTML = r.map((n, i) => window.CC_UI.newsCard(n, i < 2)).join("") || `<p class="muted">No ${esc(cat)} stories yet today.</p>`; };
      $("#news-cats").onclick = e => { const b = e.target.closest("[data-c]"); if (!b) return; $$("[data-c]").forEach(x => x.setAttribute("aria-pressed", x === b)); cat = b.dataset.c; draw(); };
      draw();
    },
    /* ---------------- Launchpad ---------------- */
    async launchpad() {
      let level = "";
      const draw = async () => {
        const ps = await API.fetchProducts(level); const feat = D.products.find(p => p.featured);
        $("#lp-featured").innerHTML = feat ? `<a class="feat-slot hov" href="product.html?id=${feat.id}"><span class="badge-t">FEATURED</span><b>${esc(feat.name)}</b><span>${esc(feat.tagline)}</span><small>Sponsored slot · book it in Marketplace</small></a>` : "";
        $("#lp-list").innerHTML = ps.map((p, i) => `<li class="prod card hov" data-id="${p.id}">
          <span class="rank">#${i + 1}</span><span class="plogo" aria-hidden="true">${esc(p.name.slice(0, 2).toUpperCase())}</span>
          <div class="grow"><a href="product.html?id=${p.id}"><h3>${esc(p.name)}</h3></a><p>${esc(p.tagline)}</p>
            <div class="row">${levelBadge(p.level)}<span class="stage s-${p.stage}">${p.stage}</span>${p.tags.map(t => `<span class="tagx">${esc(t)}</span>`).join("")}${avatars(p.makers)}<small>${ico("comment")} ${p.comments}</small></div></div>
          <button class="vote" type="button" aria-pressed="false" aria-label="Upvote ${esc(p.name)}">▲<b>${p.votes}</b></button></li>`).join("");
      };
      $("#lp-list").addEventListener("click", async e => { const v = e.target.closest(".vote"); if (!v) return; const on = v.getAttribute("aria-pressed") !== "true"; v.setAttribute("aria-pressed", on); const b = $("b", v); b.textContent = +b.textContent + (on ? 1 : -1); await API.upvoteProduct(v.closest("[data-id]").dataset.id); });
      $("#lp-date").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      levelChips(l => { level = l; draw(); }); draw();
    },
    async product() {
      const p = await API.fetchProduct(q.get("id") || "boda-safe"); document.title = p.name + " · Launchpad · 101 Codecrafts";
      $("#p-head").innerHTML = `<span class="plogo big" aria-hidden="true">${esc(p.name.slice(0, 2).toUpperCase())}</span><div class="grow"><div class="kicker">Launchpad</div><h1>${esc(p.name)}</h1><p>${esc(p.tagline)}</p><div class="row">${levelBadge(p.level)}<span class="stage s-${p.stage}">${p.stage}</span>${avatars(p.makers)}</div></div>
        <div class="row">${p.demo ? `<a class="btn or" href="${esc(p.demo)}" target="_blank" rel="noopener noreferrer">Live demo ↗</a>` : ""}${p.repo ? `<a class="btn ink" href="${esc(p.repo)}" target="_blank" rel="noopener noreferrer">${ico("gh")}Repo ↗</a>` : ""}<button class="vote big" type="button" aria-pressed="false">▲<b>${p.votes}</b></button><a class="btn" data-wa-share="Check out ${esc(p.name)} on 101 Launchpad:" href="#">${ico("wa")}Share</a></div>`;
      $("#p-shots").innerHTML = [1, 2, 3].map(i => `<figure class="shot" aria-label="Screenshot ${i}"><div class="thumb-ph">${ico(i === 2 ? "chart" : "code")}</div><figcaption>Screen ${i}</figcaption></figure>`).join("");
      $("#p-log").innerHTML = p.changelog.map(c => `<div class="li"><span class="date"><b style="font-size:13px">${esc(c.v)}</b></span><div class="grow"><b>${esc(c.t)}</b><small>${esc(c.d)}</small></div></div>`).join("");
      const drawC = () => $("#p-comments").innerHTML = p.comments.map(c => `<div class="li"><span class="date">${esc(c.who.split(" ").map(w => w[0]).join(""))}</span><div class="grow"><b>${esc(c.who)}</b><small>${esc(c.t)} · ${esc(c.ago)} ago</small></div></div>`).join("");
      drawC();
      $("#p-cform").onsubmit = async e => { e.preventDefault(); const t = e.target.text.value.trim(); if (!t) return; p.comments.unshift({ who: "You", t, ago: "now" }); drawC(); e.target.reset(); await API.commentProduct(p.id, t); };
      document.addEventListener("click", e => { const v = e.target.closest(".vote"); if (!v) return; const on = v.getAttribute("aria-pressed") !== "true"; v.setAttribute("aria-pressed", on); const b = $("b", v); b.textContent = +b.textContent + (on ? 1 : -1); API.upvoteProduct(p.id); });
    },
    /* ---------------- Beta testing ---------------- */
    async testing() {
      let level = "";
      const draw = async () => { const cs = await API.fetchCampaigns(level);
        $("#camp").innerHTML = cs.map(c => `<article class="card" data-id="${c.id}"><div class="row" style="justify-content:space-between"><b class="h3">${esc(c.product)}</b>${levelBadge(c.level)}</div><p>${esc(c.what)}</p>
          <div class="prog" role="progressbar" aria-valuenow="${c.taken}" aria-valuemax="${c.slots}" aria-label="Tester slots taken"><i style="width:${c.taken / c.slots * 100}%"></i></div>
          <div class="row" style="justify-content:space-between;margin-top:8px"><small><b>${c.slots - c.taken}</b> tester slots left · ends in ${countdown(c.ends)}</small><small>🎁 ${esc(c.reward)}</small></div>
          <button class="btn or sm" data-join style="margin-top:10px" ${c.slots === c.taken ? "disabled" : ""}>Join this test</button></article>`).join("");
        $("#bug-product").innerHTML = cs.map(c => `<option>${esc(c.product)}</option>`).join(""); };
      $("#camp").addEventListener("click", async e => { if (!e.target.closest("[data-join]")) return; const id = e.target.closest("[data-id]").dataset.id; await API.joinCampaign(id); e.target.textContent = "Joined ✓"; e.target.disabled = true; });
      $("#become").onclick = async () => { await API.becomeTester({}); toast("You're on the tester list. We'll match you to campaigns at your level."); };
      $("#bug-form").onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target); const r = await API.submitBugReport(fd); $("#bug-msg").textContent = r ? "Report sent to the makers." : `Saved: "${fd.get("title")}" (${fd.get("severity")}). The reports backend is not connected yet.`; e.target.reset(); };
      const tri = await API.fetchTriage();
      $("#triage").innerHTML = Object.entries(tri).map(([col, items]) => `<div class="tcol" data-col="${esc(col)}"><h3>${esc(col)} <small>${items.length}</small></h3>${items.map(b => `<div class="bug sev-${b.sev}" draggable="true" data-id="${b.id}" tabindex="0"><b>${esc(b.t)}</b><small>${b.sev} · @${esc(b.who)}</small></div>`).join("")}</div>`).join("");
      let drag = null; $("#triage").addEventListener("dragstart", e => drag = e.target.closest(".bug")); $("#triage").addEventListener("dragover", e => e.preventDefault());
      $("#triage").addEventListener("drop", e => { const col = e.target.closest(".tcol"); if (col && drag) { col.appendChild(drag); API.moveBug(drag.dataset.id, col.dataset.col); } });
      levelChips(l => { level = l; draw(); }); draw();
    },
    /* ---------------- Competitions ---------------- */
    async competitions() {
      const st = { level: "", track: "" };
      $("#f-track").innerHTML = `<option value="">All tracks</option>` + [...new Set(D.competitions.map(c => c.track))].map(t => `<option>${esc(t)}</option>`).join("");
      const draw = async () => { const cs = await API.fetchCompetitions(st.level, st.track);
        $("#comp").innerHTML = cs.map(c => `<article class="card comp" data-id="${c.id}"><div class="row" style="justify-content:space-between">${levelBadge(c.level)}<span class="tagx">${esc(c.track)}</span></div>
          <h3 class="h3">${esc(c.name)}</h3><div class="cd" data-starts="${c.starts}">${countdown(c.starts)}</div><small>Teams ${esc(c.team)} · ${c.registered} registered · Prize: <b>${esc(c.prize)}</b></small>
          <div class="row" style="margin-top:10px"><button class="btn sm or" data-reg="solo">Register solo</button><button class="btn sm ink" data-reg="team">Register a team</button><button class="btn sm" data-sub>Submit</button></div></article>`).join("") || `<p class="muted">No competitions for this filter yet.</p>`; };
      setInterval(() => $$(".cd").forEach(el => el.textContent = countdown(el.dataset.starts)), 30000);
      $("#comp").addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return; const id = b.closest("[data-id]").dataset.id;
        if (b.dataset.reg) { const team = b.dataset.reg === "team" ? prompt("Team name?") : null; if (b.dataset.reg === "team" && !team) return; await API.registerCompetition(id, { mode: b.dataset.reg, team }); toast(`Registered ${team ? "team " + team : "solo"}.`); }
        if (b.hasAttribute("data-sub")) { const url = prompt("Link to your submission (repo, video or demo):"); if (url) { await API.submitEntry(id, { url }); toast("Submission received."); } } });
      $("#f-track").onchange = e => { st.track = e.target.value; draw(); };
      const lb = await API.fetchLeaderboard("hack25");
      $("#lb tbody").innerHTML = lb.map((r, i) => `<tr><td><b>${i + 1}</b></td><td>${esc(r.team)}</td><td>${r.members}</td><td><b>${r.pts}</b></td></tr>`).join("");
      levelChips(l => { st.level = l; draw(); }); draw();
    },
    /* ---------------- Groups ---------------- */
    async groups() {
      const id = q.get("id");
      if (id) { $("#g-list-wrap").hidden = true; $("#g-one").hidden = false; const g = await API.fetchGroup(id);
        $("#g-one").innerHTML = `<div class="page-h"><div><div class="kicker">${esc(g.kind)}</div><h1>${esc(g.name.toUpperCase())}</h1><p>${esc(g.desc)}</p><div class="row">${levelBadge(g.level)}<small>${g.members} members</small></div></div><button class="btn or" data-joing="${g.id}">${g.open ? "Join group" : "Request to join"}</button></div>
          <div class="grid g3"><div class="card" style="grid-column:span 2"><div class="sec-title"><h2>FEED</h2></div><div class="list">${g.feed.map(f => `<div class="li"><span class="date">${esc(f.who.split(" ").map(w => w[0]).join(""))}</span><div class="grow"><b>${esc(f.who)}</b><small>${esc(f.t)} · ${f.ago} ago</small></div></div>`).join("")}</div></div>
          <div class="card"><div class="sec-title"><h2>MEMBERS</h2></div>${avatars(["SN", "DK", "GM", "IM", "EA", "PW"])}<div class="sec-title" style="margin-top:16px"><h2>PROJECTS</h2></div><div class="list">${g.projects.map(p => `<a class="li" href="projects.html#${p.id}"><div class="grow"><b>${esc(p.name)}</b><small>${p.progress}% done</small></div></a>`).join("")}</div></div></div>`;
        return; }
      const st = { level: "", kind: "" };
      $("#f-kind").innerHTML = ["", "Study group", "Project team", "School chapter"].map(k => `<button type="button" class="chip" aria-pressed="${!k}" data-k="${k}">${k || "All"}</button>`).join("");
      const draw = async () => { const gs = await API.fetchGroups(st.level, st.kind);
        $("#g-list").innerHTML = gs.map(g => `<article class="card"><div class="row" style="justify-content:space-between"><span class="tagx">${esc(g.kind)}</span>${levelBadge(g.level)}</div><h3 class="h3"><a href="groups.html?id=${g.id}">${esc(g.name)}</a></h3><p>${esc(g.desc)}</p><div class="row" style="justify-content:space-between;margin-top:8px"><small>${g.members} members</small><button class="btn sm ${g.open ? "or" : ""}" data-joing="${g.id}">${g.open ? "Join" : "Request"}</button></div></article>`).join(""); };
      $("#f-kind").onclick = e => { const b = e.target.closest("[data-k]"); if (!b) return; $$("[data-k]").forEach(x => x.setAttribute("aria-pressed", x === b)); st.kind = b.dataset.k; draw(); };
      levelChips(l => { st.level = l; draw(); }); draw();
    },
    /* ---------------- Projects ---------------- */
    async projects() {
      const ps = await API.fetchProjects();
      $("#pj").innerHTML = ps.map(p => `<article class="card" id="${p.id}" data-id="${p.id}"><div class="row" style="justify-content:space-between"><span class="tagx">${p.kind} project</span>${levelBadge(p.level)}</div>
        <h3 class="h3">${esc(p.name)}</h3><div class="row"><div class="prog" style="flex:1"><i style="width:${p.progress}%"></i></div><b>${p.progress}%</b></div>${avatars(p.team)}
        <ul class="ms">${p.milestones.map((m, i) => `<li><label class="row"><input type="checkbox" data-ms="${i}" ${m.done ? "checked" : ""}> ${esc(m.t)}</label></li>`).join("")}</ul>
        <div class="row"><button class="btn sm or" data-promote>${ico("arrow")}Promote to Launchpad</button><a class="btn sm" href="testing.html">Start a beta test</a></div></article>`).join("");
      $("#pj").addEventListener("change", e => { const i = e.target.dataset.ms; if (i == null) return; API.toggleMilestone(e.target.closest("[data-id]").dataset.id, +i, e.target.checked); });
      $("#pj").addEventListener("click", async e => { if (!e.target.closest("[data-promote]")) return; await API.promoteToLaunchpad(e.target.closest("[data-id]").dataset.id); toast("Sent to Launchpad review. Admins check it before it goes live."); });
      $("#new-project").onsubmit = e => { e.preventDefault(); toast(`Project “${e.target.name.value}” created (POST /api/projects).`); e.target.reset(); };
    },
    /* ---------------- Profile / verify ---------------- */
    async profile() {
      const handle = (location.pathname.match(/\/u\/([^/]+)/) || [])[1] || q.get("u") || "sarah-n"; const p = await API.fetchProfile(handle);
      $("#pf").innerHTML = `<div class="page-h"><div class="row"><span class="plogo big">${esc(p.name.split(" ").map(w => w[0]).join(""))}</span><div><div class="kicker">@${esc(p.handle)}</div><h1>${esc(p.name.toUpperCase())}</h1><p>${esc(p.bio)}</p><div class="row">${levelBadge(p.level)}<span class="tagx">${esc(p.role)}</span></div></div></div><a class="btn" data-wa-share="${esc(p.name)} on 101 Codecrafts:" href="#">${ico("wa")}Share profile</a></div>
        <div class="grid g2"><div class="card"><div class="sec-title"><h2>BADGES</h2></div><div class="row">${p.badges.map(b => `<span class="badge-t" style="position:static">${esc(b)}</span>`).join("")}</div></div>
        <div class="card"><div class="sec-title"><h2>PROJECTS</h2></div><div class="list">${p.projects.map(x => `<div class="li"><div class="grow"><b>${esc(x.name)}</b><small>${x.kind} · ${x.progress}% done</small></div></div>`).join("")}</div></div></div>`;
    },
    async verify() {
      const go = async code => { const r = await API.verifyCertificate(code.trim().toUpperCase());
        $("#vr").innerHTML = r.valid ? `<div class="vok">${ico("check")}<div><b>Valid certificate</b><p>${esc(r.name)} completed <b>${esc(r.course)}</b> on ${esc(r.issued)}.</p></div></div>` : `<div class="vbad">${ico("xmark")}<div><b>${r.malformed ? "That code doesn't look right" : "No certificate found"}</b><p>Codes look like 101-XXXX-XXXX. Check for typos, or ask the holder for their verification link.</p></div></div>`; };
      $("#vf").onsubmit = e => { e.preventDefault(); go(e.target.code.value); };
      if (q.get("code")) { $("#vf").code.value = q.get("code"); go(q.get("code")); }
    },
    /* ---------------- Auth + onboarding ---------------- */
    async signin() { $("#si").onsubmit = async e => { e.preventDefault(); const f = e.target; const r = await API.signIn(f.email.value, f.password.value); $("#si-msg").textContent = r ? "Signed in." : "Sign-in needs the backend (POST /api/auth/sign-in). Opening the dashboard preview."; if (!r) setTimeout(() => location.href = "dashboard.html", 900); }; },
    async signup() {
      const f = $("#su"); const age = () => { const d = Date.parse(f.dob.value); return d ? (Date.now() - d) / 31557600000 : 99; };
      f.dob.onchange = () => { $("#guardian").hidden = age() >= 18; $$("#guardian input").forEach(i => i.required = age() < 18); };
      f.onsubmit = async e => { e.preventDefault(); const data = Object.fromEntries(new FormData(f)); if (age() < 18) await API.requestGuardianConsent({ child: data.email, guardian: data.g_email, phone: data.g_phone });
        await API.signUp(data); sessionStorage.setItem("cc_signup", JSON.stringify({ name: data.name, minor: age() < 18 })); location.href = "onboarding.html"; };
    },
    async onboarding() {
      const steps = $$(".step"); let i = 0; const show = () => { steps.forEach((s, j) => s.hidden = j !== i); $("#ob-n").textContent = `Step ${i + 1} of ${steps.length}`; $("#ob-back").disabled = i === 0; $("#ob-next").textContent = i === steps.length - 1 ? "Finish" : "Next"; };
      const pick = sel => $$(sel).forEach(b => b.onclick = () => { if (b.dataset.single !== undefined) $$(sel).forEach(x => x.setAttribute("aria-pressed", x === b)); else b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); if (b.dataset.role) { $("#tutor-levels").hidden = b.dataset.role !== "tutor"; $("#learner-level").hidden = b.dataset.role !== "learner"; } });
      pick("[data-role]"); pick("[data-mylevel]"); pick("[data-teach]"); pick("[data-int]");
      const s = JSON.parse(sessionStorage.getItem("cc_signup") || "{}"); if (s.minor) $("#minor-note").hidden = false;
      $("#ob-back").onclick = () => { i--; show(); };
      $("#ob-next").onclick = async () => { if (i < steps.length - 1) { i++; show(); return; }
        const val = sel => $$(sel + "[aria-pressed=true]").map(b => b.textContent.trim());
        await API.saveOnboarding({ role: val("[data-role]")[0], level: val("[data-mylevel]")[0], teaches: val("[data-teach]"), interests: val("[data-int]") });
        location.href = val("[data-role]")[0] === "Tutor" ? "tutor.html" : "dashboard.html"; };
      show();
    },
    /* ---------------- Course player ---------------- */
    async course() {
      const c = await API.fetchCourse(q.get("id") || "web-basics"); const done = new Set(JSON.parse(localStorage.getItem("cc_done_" + c.id) || "null") || c.lessons.filter(l => l.done).map(l => l.id));
      let cur = Math.max(0, c.lessons.findIndex(l => l.id === q.get("lesson")) ); if (!q.get("lesson")) cur = Math.max(0, c.lessons.findIndex(l => !done.has(l.id)));
      $("#c-path").textContent = c.path; $("#c-title").textContent = c.title.toUpperCase();
      $("#c-meta").innerHTML = `${levelBadge(c.level)}<span class="tagx">Tutor: ${esc(c.tutor)}</span><span class="tagx">${c.lessons.length} lessons</span>`;
      const lite = () => document.documentElement.classList.contains("lite");
      const progress = () => { const p = Math.round(done.size / c.lessons.length * 100); $("#c-pct").textContent = `${p}% complete · ${done.size}/${c.lessons.length} lessons`; $("#c-bar").style.width = p + "%"; };
      const list = () => { $("#c-lessons").innerHTML = c.lessons.map((l, i) => `<li><a href="?lesson=${l.id}" data-i="${i}" ${i === cur ? 'aria-current="true"' : ""}><span class="tick ${done.has(l.id) ? "on" : ""}" aria-label="${done.has(l.id) ? "Completed" : "Not completed"}">${done.has(l.id) ? ico("check") : i + 1}</span><span>${esc(l.title)}</span></a></li>`).join(""); };
      const video = l => {
        if (!l.yt) { $("#c-video").innerHTML = `<div class="facade"><div class="thumb-ph">${ico("clipboard")}</div><span class="play-lbl">Hands-on lesson · no video</span></div>`; return; }
        /* facade: only the thumbnail loads until the learner presses play (saves data); Lite mode uses the small thumbnail */
        const th = `https://i.ytimg.com/vi/${l.yt}/${lite() ? "mqdefault" : "hqdefault"}.jpg`;
        $("#c-video").innerHTML = `<button class="facade" type="button" aria-label="Play video: ${esc(l.title)}"><img src="${th}" alt="" loading="lazy" decoding="async"><span class="play">▶</span><span class="play-lbl">${lite() ? "Data saver on · tap to load video" : "Play lesson"}</span></button>`;
        $("#c-video .facade").onclick = () => { $("#c-video").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${l.yt}?autoplay=1&rel=0&modestbranding=1" title="${esc(l.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`; };
      };
      const show = () => { const l = c.lessons[cur]; $("#c-ltitle").textContent = `${cur + 1}. ${l.title}`; video(l); list(); progress();
        $("#c-done").setAttribute("aria-pressed", done.has(l.id)); $("#c-done").lastChild.textContent = done.has(l.id) ? "Completed" : "Mark complete";
        $("#c-next").disabled = cur === c.lessons.length - 1;
        $("#p-ov").innerHTML = `<p>${esc(c.overview)}</p><p class="muted" style="margin-top:8px">Lesson ${cur + 1} of ${c.lessons.length}${l.quiz ? " · includes a short quiz" : ""}. Videos open from YouTube in privacy-enhanced mode.</p>`;
        $("#c-notes").value = localStorage.getItem(`cc_notes_${c.id}_${l.id}`) || ""; history.replaceState(null, "", "?lesson=" + l.id); };
      $("#c-lessons").addEventListener("click", e => { const a = e.target.closest("[data-i]"); if (!a) return; e.preventDefault(); cur = +a.dataset.i; show(); });
      $("#c-done").onclick = async () => { const l = c.lessons[cur], on = !done.has(l.id); on ? done.add(l.id) : done.delete(l.id); await API.markLessonComplete(c.id, l.id, on); show(); };
      $("#c-next").onclick = () => { if (cur < c.lessons.length - 1) { cur++; show(); } };
      let tN; $("#c-notes").oninput = e => { clearTimeout(tN); tN = setTimeout(async () => { await API.saveNotes(c.id, c.lessons[cur].id, e.target.value); $("#c-saved").textContent = "Saved " + new Date().toLocaleTimeString(); }, 600); };
      const tabs = $$("[role=tab]"); const sel = t => { tabs.forEach(x => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; $("#" + x.getAttribute("aria-controls")).hidden = !on; }); t.focus(); };
      tabs.forEach((t, i) => { t.onclick = () => sel(t); t.onkeydown = e => { if (e.key === "ArrowRight") sel(tabs[(i + 1) % tabs.length]); if (e.key === "ArrowLeft") sel(tabs[(i + tabs.length - 1) % tabs.length]); }; });
      $("#c-books").innerHTML = c.books.map(b => `<a class="rcard book hov" href="${API.goHref(b.id)}" target="_blank" rel="noopener noreferrer"><div class="rthumb cover"><img src="${esc(b.cover)}" alt="Cover of ${esc(b.title)}" loading="lazy" class="heavy" onerror="this.remove()"><span class="badge-t ${b.open ? "cy" : ""}">${b.open ? "Free / open" : "Book"}</span></div><div class="rbody"><h3>${esc(b.title)}</h3><div class="src">${esc(b.author)}</div><span class="open">Open on ${esc(b.site)} ↗</span></div></a>`).join("");
      const disc = () => $("#c-disc").innerHTML = c.discussion.map(d => `<div class="li"><span class="date">${esc(d.who.split(" ").map(w => w[0]).join(""))}</span><div class="grow"><b>${esc(d.who)}</b><small>${esc(d.t)} · ${esc(d.ago)} ago${d.replies ? " · " + d.replies + " replies" : ""}</small></div></div>`).join("");
      $("#c-dform").onsubmit = async e => { e.preventDefault(); const t = e.target.text.value.trim(); if (!t) return; c.discussion.unshift({ who: "You", t, ago: "now", replies: 0 }); disc(); e.target.reset(); await API.postDiscussion(c.id, t); };
      disc(); show();
    },
    /* ---------------- /go/<id> → original source ---------------- */
    async go() {
      const id = q.get("id") || (location.pathname.match(/\/go\/([^/?#]+)/) || [])[1];
      if (!window.__ccNewsCache) await API.fetchNews();
      const item = id && API.lookupGo(decodeURIComponent(id));
      if (item && /^https?:\/\//.test(item.url)) { $("#go-to").textContent = item.url; $("#go-link").href = item.url; location.replace(item.url); }
      else $("#go-to").textContent = "We couldn't find that link. It may have been removed from the Library.";
    }
  };
  if (R[page]) R[page]();
})();
