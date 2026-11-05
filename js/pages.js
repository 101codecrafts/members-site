/* Renderers for the member pages (library, news, launchpad, product, testing, competitions, groups, projects,
   profile, verify, auth/onboarding, go). Each reads data only through CC_API. */
(function () {
  const { $, $$, esc, ugx, ico } = window.CC_UI, API = window.CC_API, D = window.CC_DATA;
  const page = document.body.dataset.page, q = new URLSearchParams(location.search);
  const STATIC = API ? !!API.STATIC : q.has("static");
  const LV_CLR = { Primary: "#13a35c", "O-Level": "#1b8acb", "A-Level": "#7a3fb0", University: "#a85400", Professional: "#0B1236" };
  const levelBadge = l => l ? `<span class="lvl" style="--lv:${LV_CLR[l] || "#0B1236"}">${esc(l)}</span>` : "";
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
    /* ---------------- Courses catalog: 101 Courses + Free Courses Worldwide ---------------- */
    async courses() {
      const [c101, ext] = await Promise.all([API.fetchCourses101(), API.fetchExternalCourses()]);
      const P = D.providers, ACC = ["Free", "Free audit", "Free trial", "Free until", "Financial aid"];
      const st = { q: "", cat: "", prov: "", acc: "", level: "" };
      const prov = k => P[k] || { name: "Other", short: "↗", bg: "#0B1236", fg: "#fff" };
      /* offer end dates are stored in EAT (+03:00); show them on the Kampala calendar so the day never shifts */
      const fmtDate = (iso, year) => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: year ? "numeric" : undefined, timeZone: "Africa/Kampala" }); } catch (e) { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: year ? "numeric" : undefined }); } };
      const parts = iso => { const ms = Date.parse(iso) - Date.now(); return ms <= 0 ? null : { d: Math.floor(ms / 864e5), h: Math.floor(ms % 864e5 / 36e5), m: Math.floor(ms % 36e5 / 6e4) }; };
      const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
      /* visual: "13d 06h 15m" (tabular, fixed width) · spoken: "13 days 6 hours left" (minutes only in the last day) */
      const cdVis = t => t ? `${t.d}d ${String(t.h).padStart(2, "0")}h ${String(t.m).padStart(2, "0")}m` : "Ended";
      const cdSay = t => !t ? "Offer ended" : (t.d ? `${pl(t.d, "day")} ${pl(t.h, "hour")} left` : `${pl(t.h, "hour")} ${pl(t.m, "minute")} left`);
      const URGENT = 7 * 864e5;
      const accLabel = x => x.access === "Free until" && x.free_until ? `Free until ${fmtDate(x.free_until)}` : x.access;
      const accCls = a => ({ "Free": "a-free", "Free audit": "a-audit", "Free trial": "a-trial", "Free until": "a-until", "Financial aid": "a-aid" }[a] || "a-free");
      const stars = r => `<span class="rating" aria-label="Rated ${r} out of 5">${ico("star")}<b>${r.toFixed(1)}</b></span>`;
      const cover = (src, label, bg) => `<div class="cthumb ck-media" style="--pbg:${bg}"><span class="cph" aria-hidden="true">${esc(label)}</span><img class="heavy" src="${esc(src)}" alt="" width="640" height="360" loading="lazy" decoding="async" onerror="this.remove()">`;
      const card101 = c => `<article class="ccard c101 ck ck--flush" data-id="${esc(c.id)}">
        ${cover(c.cover, c.category, "#0B1236")}<span class="price ${c.price ? "" : "free"}">${c.price ? ugx(c.price) : "Free"}</span></div>
        <div class="cbody"><h3 class="ck-title"><a class="ck-link" href="course.html?id=${encodeURIComponent(c.id)}">${esc(c.title)}</a></h3><div class="tutor">${ico("teacher")}<span>Tutor: <b>${esc(c.tutor)}</b></span></div>
          <div class="row">${levelBadge(c.level)}${stars(c.rating)}<small>(${c.reviews})</small></div>
          <div class="meta"><span>${esc(c.category)}</span><span>${c.lessons} lessons</span></div>
          <span class="open ck-foot" aria-hidden="true">Start learning →</span></div></article>`;
      /* external course card = the card system's fixed anatomy: media (16:9, access badge) → title (the one stretched link)
         → provider → short description (3 lines) → level / certificate badges → optional end date → action pinned to the bottom */
      const extCard = x => { const p = prov(x.provider), until = x.free_until && Date.parse(x.free_until) > Date.now();
        return `<article class="ccard ext ck ck--flush" data-id="${esc(x.id)}">
        ${cover(x.cover || `assets/img/courses/${x.provider}.svg`, p.name, p.bg)}<span class="acc ${accCls(x.access)}">${esc(accLabel(x))}</span></div>
        <div class="cbody"><h3 class="ck-title"><a class="ck-link" href="${API.goHref(x.id)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}<span class="sr-only"> on ${esc(p.name)} (opens in a new tab)</span></a></h3>
          <div class="prov"><span class="pmark" style="background:${p.bg};color:${p.fg}" aria-hidden="true">${esc(p.short)}</span><span>${esc(p.name)}</span></div>
          ${x.desc ? `<p class="ck-body">${esc(x.desc)}</p>` : ""}
          <div class="row cbadges">${levelBadge(x.level)}${x.certFree ? `<span class="cert">${ico("check")}Certificate free</span>` : ""}${x.aid && x.access !== "Financial aid" ? `<span class="aidc">Financial aid</span>` : ""}</div>
          ${until ? `<p class="cdm">Free until <b class="nw">${esc(fmtDate(x.free_until, true))}</b>${x.free_until_status === "TODO-CONFIRM" ? ` <span class="nw">· <abbr title="Date to be confirmed">TBC</abbr></span>` : ""}</p>` : ""}
          <span class="ck-foot cgo" aria-hidden="true">Open on ${esc(p.name)} ↗</span>
        </div></article>`; };
      window.CC_UI.extCourseCard = extCard;
      /* filters */
      $("#cf-cat").innerHTML = `<option value="">All categories</option>` + D.categories.map(c => `<option>${esc(c)}</option>`).join("");
      $("#cf-prov").innerHTML = `<option value="">All providers</option><option value="101">101 Codecrafts</option>` + Object.entries(P).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join("");
      $("#cf-acc").innerHTML = `<option value="">Any access</option>` + ACC.map(a => `<option>${a}</option>`).join("");
      ["#cf-q", "#cf-cat", "#cf-prov", "#cf-acc"].forEach(s => { $(s).autocomplete = "off"; $(s).value = ""; });
      const hit = (s) => !st.q || s.toLowerCase().includes(st.q);
      /* ?path=<slug> (landing "Popular learning paths") and ?skill=<slug> (landing skills strip): a topic filter = categories
         plus a keyword test on title/description. When it matches nothing, every card shows and the chip says so. */
      const TOPICS = {
        path: {
          "software-dev": { label: "Software Development", cats: ["Web Development", "Computer Science"], re: /software|programming|javascript|python|web dev|git|computer science|cs50/i },
          "ui-ux": { label: "UI/UX Design", cats: [], re: /\b(ui|ux)\b|design|figma|prototype/i },
          "data-ai": { label: "Data & AI", cats: ["Data & AI"], re: /\bdata\b|machine learning|\bai\b|analytics/i },
          "digital-marketing": { label: "Digital Marketing", cats: [], re: /marketing|digital skills|seo|social media|grow with google/i },
          "cyber-security": { label: "Cyber Security", cats: ["Cybersecurity"], re: /cyber|security|ethical hacking/i },
          "mobile-dev": { label: "Mobile Development", cats: [], re: /mobile|android|ios\b|flutter|kotlin|react native/i }
        },
        skill: {
          "python": { label: "Python", cats: [], re: /python/i },
          "html-css": { label: "HTML & CSS", cats: [], re: /html|css|responsive web|web design|web development basics/i },
          "ui-design": { label: "UI design", cats: [], re: /\b(ui|ux)\b|design|figma/i },
          "cloud": { label: "Cloud", cats: ["Cloud"], re: /cloud|azure|aws|devops/i },
          "cyber-security": { label: "Cyber security", cats: ["Cybersecurity"], re: /cyber|security|ethical hacking/i },
          "data-analysis": { label: "Data analysis", cats: ["Data & AI"], re: /\bdata\b|analy/i }
        }
      };
      let tKind = q.get("path") ? "path" : q.get("skill") ? "skill" : "";
      const tKey = tKind && q.get(tKind).toLowerCase();
      st.topic = (tKind && TOPICS[tKind][tKey]) || null;
      const topicHit = (cat, text) => !st.topic || st.topic.cats.includes(cat) || st.topic.re.test(text);
      const chip = $("#cf-topic");
      const paintChip = (none) => {
        if (!chip) return;
        if (!st.topic && !tKind) { chip.hidden = true; chip.innerHTML = ""; return; }
        chip.hidden = false;
        const name = st.topic ? st.topic.label : q.get(tKind);
        const what = tKind === "path" ? "Learning path" : "Skill";
        chip.innerHTML = `<span class="tchip on">${esc(what)}: <b>${esc(name)}</b><button type="button" class="tchip-x" aria-label="Clear the ${esc(what.toLowerCase())} filter">${ico("xmark")}</button></span>`
          + (none || !st.topic ? `<small class="muted">No courses for ${esc(name)} yet, so every course is shown below.</small>` : "");
        $(".tchip-x", chip).onclick = () => { st.topic = null; history.replaceState(null, "", location.pathname + location.hash); q.delete(tKind); tKind = ""; chip.hidden = true; chip.innerHTML = ""; draw(); };
      };
      const draw = () => {
        const run = withTopic => [
          c101.filter(c => (!st.prov || st.prov === "101") && (!st.cat || c.category === st.cat) && (!st.level || c.level === st.level) && (!st.acc || (st.acc === "Free" && !c.price)) && hit(c.title + c.tutor + c.category + " 101 codecrafts") && (!withTopic || topicHit(c.category, c.title))),
          ext.filter(x => (!st.prov || st.prov === x.provider) && (!st.cat || x.category === st.cat) && (!st.level || x.level === st.level) && (!st.acc || x.access === st.acc || (st.acc === "Financial aid" && x.aid)) && hit(x.title + x.desc + prov(x.provider).name + x.category) && (!withTopic || topicHit(x.category, x.title + " " + (x.desc || ""))))];
        let [a, b] = run(true), none = false;
        if (st.topic && !a.length && !b.length) { [a, b] = run(false); none = true; }
        if (tKind) paintChip(none);
        const why = st.topic && !none ? ` for ${esc(st.topic.label)}` : " for these filters";
        const empty = (what, total) => `<div class="cempty"><p><b>No ${what}${why} yet.</b> ${total} ${what} in total.</p><button type="button" class="btn" data-reset>Show all ${what}</button></div>`;
        $("#g101").innerHTML = a.map(card101).join("") || empty("101 courses", c101.length);
        $("#gfree").innerHTML = b.map(extCard).join("") || empty("free courses", ext.length);
        /* "7 courses" when nothing filters the list, "Showing 3 of 7" when something does */
        const count = (n, total) => n === total ? pl(total, "course") : `Showing ${n} of ${total}`;
        $("#n101").textContent = count(a.length, c101.length); $("#nfree").textContent = count(b.length, ext.length);
        $$("#n101,#nfree").forEach(el => el.classList.toggle("is-filtered", !/course/.test(el.textContent)));
      };
      /* "Show all": clears every filter (search, selects, level chips, ?path/?skill) */
      const resetAll = () => {
        Object.assign(st, { q: "", cat: "", prov: "", acc: "", level: "" }); ["#cf-q", "#cf-cat", "#cf-prov", "#cf-acc"].forEach(s => { $(s).value = ""; });
        $$("[data-lv]").forEach(x => x.setAttribute("aria-pressed", x.dataset.lv === ""));
        if (tKind) { const x = $(".tchip-x", chip); if (x) return x.click(); }
        draw();
      };
      $("#main").addEventListener("click", e => { if (e.target.closest("[data-reset]")) { resetAll(); const h = $("#h101"); if (h) h.closest("section").scrollIntoView({ block: "start" }); } });
      const on = (sel, k) => $(sel).addEventListener(sel === "#cf-q" ? "input" : "change", e => { st[k] = k === "q" ? e.target.value.trim().toLowerCase() : e.target.value; draw(); });
      on("#cf-q", "q"); on("#cf-cat", "cat"); on("#cf-prov", "prov"); on("#cf-acc", "acc");
      if (q.get("q")) { $("#cf-q").value = q.get("q"); st.q = q.get("q").toLowerCase(); }
      /* expiring soon: limited-time free offers ending within 60 days, soonest first (not affected by filters).
         Card: provider badge (eyebrow) → title (2 lines, the one stretched link) → "Free until 16 Nov 2026 · TBC" → countdown block.
         Under 7 days the card says "Ends soon" in words as well as turning orange. Ended offers remove themselves. */
      const expCard = x => { const p = prov(x.provider), t = parts(x.free_until), urgent = Date.parse(x.free_until) - Date.now() < URGENT;
        return `<li class="xp-li"><article class="ck ck--inv xp${urgent ? " is-urgent" : ""}" data-exp="${esc(x.free_until)}">
          <div class="ck-eyebrow xp-eye"><span class="pmark" style="background:${p.bg};color:${p.fg}" aria-hidden="true">${esc(p.short)}</span><span class="xp-prov">${esc(p.name)}</span><span class="xp-flag"${urgent ? "" : " hidden"}>Ends soon</span></div>
          <h4 class="ck-title xp-title"><a class="ck-link" href="${API.goHref(x.id)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}<span class="sr-only"> on ${esc(p.name)} (opens in a new tab)</span></a></h4>
          <p class="ck-meta xp-meta">Free until <span class="nw">${esc(fmtDate(x.free_until, true))}</span>${x.free_until_status === "TODO-CONFIRM" ? ` <span class="nw">· <abbr title="Date to be confirmed">TBC</abbr></span>` : ""}</p>
          <p class="xp-cd"><span class="xp-lbl" aria-hidden="true">Time left</span><span class="xp-num" aria-hidden="true">${cdVis(t)}</span><span class="sr-only">${cdSay(t)}</span></p>
          <span class="ck-foot xp-go" aria-hidden="true">Open on ${esc(p.name)} ↗</span>
        </article></li>`; };
      const soon = ext.filter(x => x.free_until && Date.parse(x.free_until) > Date.now() && Date.parse(x.free_until) - Date.now() < 60 * 864e5).sort((x, y) => Date.parse(x.free_until) - Date.parse(y.free_until));
      const expBox = $("#expiring"), expRow = $("#exp-row");
      if (soon.length) { expBox.hidden = false; expRow.innerHTML = soon.map(expCard).join(""); expRow.dataset.n = soon.length; }
      /* one update a minute, on the minute; nothing ticks under ?static=1 or reduced motion (the first paint stays) */
      const tick = () => {
        $$("[data-exp]", expRow).forEach(card => { const iso = card.dataset.exp, t = parts(iso);
          if (!t) { card.closest("li").remove(); return; }
          const urgent = Date.parse(iso) - Date.now() < URGENT; card.classList.toggle("is-urgent", urgent); $(".xp-flag", card).hidden = !urgent;
          $(".xp-num", card).textContent = cdVis(t); $(".sr-only", $(".xp-cd", card)).textContent = cdSay(t); });
        const n = expRow.children.length; expRow.dataset.n = n; if (!n) expBox.hidden = true;
      };
      const calm = STATIC || matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (soon.length && !calm) setTimeout(() => { tick(); setInterval(tick, 6e4); }, 6e4 - Date.now() % 6e4 + 50);
      levelChips(l => { st.level = l; draw(); }); draw();
      /* tutor/admin: add an external course by link → preview → submit for review */
      const f = $("#xc-edit"); let draft = null;
      f.provider.innerHTML = Object.entries(P).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join("") + `<option value="other">Other</option>`;
      f.level.innerHTML = D.levels.map(l => `<option>${l}</option>`).join(""); f.category.innerHTML = D.categories.map(c => `<option>${esc(c)}</option>`).join(""); f.access.innerHTML = ACC.map(a => `<option>${a}</option>`).join("");
      const sync = () => { Object.assign(draft, { title: f.title.value, provider: f.provider.value, level: f.level.value, category: f.category.value, access: f.access.value, desc: f.desc.value, certFree: f.certFree.checked, free_until: f.free_until.value ? f.free_until.value + "T23:59:00+03:00" : "", free_until_status: f.free_until.value ? "TODO-CONFIRM" : "" }); $("#xc-card").innerHTML = extCard(draft); $("#xc-card").inert = true; };
      $("#xc-form").onsubmit = async e => { e.preventDefault(); const url = $("#xc-url").value.trim(); let u; try { u = new URL(url); } catch (err) { $("#xc-urlmsg").textContent = "That doesn't look like a full link (https://…)."; return; }
        $("#xc-urlmsg").textContent = "";
        draft = { ...(await API.unfurlExternalCourse(u.href)), url: u.href, id: "x-draft-" + Date.now().toString(36) };
        ["title", "provider", "level", "category", "access", "desc"].forEach(k => { if (draft[k] != null) f[k].value = draft[k]; }); f.certFree.checked = !!draft.certFree;
        $("#xc-out").hidden = false; $("#xc-msg").textContent = ""; sync(); };
      f.addEventListener("input", sync); f.addEventListener("change", sync);
      f.onsubmit = async e => { e.preventDefault(); const r = await API.addExternalCourse(draft); $("#xc-msg").textContent = r ? "Sent to admin review." : "Saved as a draft on this device — POST /api/courses/external is not connected yet."; };
    },
    /* ---------------- Free AI tools & APIs + BYOK playground ---------------- */
    async aitools() {
      const all = D.aiTools, st = { q: "", cat: "", student: false };
      const card = t => `<article class="ccard ai ck ck--flush" data-id="${esc(t.id)}">
        <div class="cthumb ai-thumb ck-media" style="--pbg:${t.bg}"><span class="cph" aria-hidden="true">${esc(t.name)}</span><img class="heavy" src="assets/img/ai/${esc(t.id)}.svg" alt="" width="640" height="300" loading="lazy" decoding="async" onerror="this.remove()">${t.student ? `<span class="acc a-student">Student perk</span>` : ""}</div>
        <div class="ai-btns"><a class="btn or" href="${API.goHref("ai-" + t.id)}" target="_blank" rel="noopener noreferrer" aria-label="Get a free API key from ${esc(t.name)} (opens in a new tab)">${t.id === "copilot" ? "Get Copilot free ↗" : t.id === "colab" ? "Open Colab ↗" : "Get free API key ↗"}</a><a class="btn" href="${API.goHref("ai-" + t.id + "-docs")}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t.name)} docs (opens in a new tab)">Docs ↗</a></div>
        <div class="cbody"><h3><span class="pmark" style="background:${t.bg};color:${t.fg}" aria-hidden="true">${esc(t.mono)}</span> ${esc(t.name)}</h3>
          <p>${esc(t.what)}</p>
          <div class="free-tier"><b>Free tier</b><span>${esc(t.free)}</span>${t.limits === "TODO-CONFIRM" ? `<small>Limits to be confirmed — check the provider's page.</small>` : ""}</div>
          <div class="tags">${t.cats.map(c => `<span>${esc(c)}</span>`).join("")}</div>
          <details class="howto"><summary>How to get your key</summary><ol>${t.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol><p class="keynote">Never paste the key into public chats or code you push. 101 never asks for it.</p></details>
        </div></article>`;
      $("#af-cat").innerHTML = [""].concat(D.aiCategories).map(c => `<button type="button" class="chip" aria-pressed="${!c}" data-c="${esc(c)}">${c || "All categories"}</button>`).join("");
      const draw = () => { const r = all.filter(t => (!st.cat || t.cats.includes(st.cat)) && (!st.student || t.student) && (!st.q || (t.name + t.what + t.free + t.cats.join(" ")).toLowerCase().includes(st.q)));
        $("#ai-grid").innerHTML = r.map(card).join("") || `<p class="muted empty">No tools match — try another filter.</p>`; $("#ai-count").textContent = r.length + " free tools"; };
      $("#af-cat").onclick = e => { const b = e.target.closest("[data-c]"); if (!b) return; $$("[data-c]").forEach(x => x.setAttribute("aria-pressed", x === b)); st.cat = b.dataset.c; draw(); };
      $("#af-q").oninput = e => { st.q = e.target.value.trim().toLowerCase(); draw(); };
      $("#af-student").onchange = e => { st.student = e.target.checked; draw(); };
      draw();
      /* BYOK playground — the key never leaves this browser except to the chosen provider */
      const prov = $("#pg-prov"), key = $("#pg-key"), model = $("#pg-model");
      prov.innerHTML = Object.entries(API.BYOK).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("");
      const sync = () => { const p = API.BYOK[prov.value]; model.value = p.model; key.value = API.byokKey.get(prov.value); $("#pg-getkey").href = API.goHref("ai-" + prov.value); };
      prov.onchange = sync; sync();
      key.oninput = () => API.byokKey.set(prov.value, key.value.trim());
      $("#pg-forget").onclick = () => { API.byokKey.clear(prov.value); key.value = ""; $("#pg-status").textContent = "Key removed from this tab."; };
      $("#pg-form").onsubmit = async e => { e.preventDefault(); const k = key.value.trim(); const out = $("#pg-out");
        if (!k) { $("#pg-status").textContent = "Paste your own key first."; key.focus(); return; }
        $("#pg-send").disabled = true; $("#pg-status").textContent = "Sending to " + API.BYOK[prov.value].label + "…";
        try { const r = await API.byokChat(prov.value, k, model.value.trim(), $("#pg-prompt").value.trim()); out.hidden = false; out.textContent = r.text; $("#pg-status").textContent = "Reply from " + r.model + (r.usage && r.usage.total_tokens ? " · " + r.usage.total_tokens + " tokens" : ""); }
        catch (err) { out.hidden = false; out.textContent = "Error: " + (err.name === "AbortError" ? "timed out" : err.message) + "\n\nCheck the key, the model id (free models change), and your free-tier limits. Some providers may block browser requests (CORS)."; $("#pg-status").textContent = ""; }
        finally { $("#pg-send").disabled = false; } };
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
        $("#lp-list").innerHTML = ps.map((p, i) => `<li class="prod card ck ck--compact" data-id="${p.id}">
          <span class="rank">#${i + 1}</span><span class="plogo" aria-hidden="true">${esc(p.name.slice(0, 2).toUpperCase())}</span>
          <div class="grow ck-text"><h3 class="ck-title"><a class="ck-link" href="product.html?id=${p.id}">${esc(p.name)}</a></h3><p>${esc(p.tagline)}</p>
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
      $("#p-log").innerHTML = p.changelog.map(c => `<div class="li"><span class="date"><b style="font-size:var(--step--1)">${esc(c.v)}</b></span><div class="grow"><b>${esc(c.t)}</b><small>${esc(c.d)}</small></div></div>`).join("");
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
        $("#comp").innerHTML = cs.map(c => `<article class="card comp ck" data-id="${c.id}"><div class="row" style="justify-content:space-between">${levelBadge(c.level)}<span class="tagx">${esc(c.track)}</span></div>
          <h3 class="h3 ck-title">${esc(c.name)}</h3><div class="cd" data-starts="${c.starts}">${countdown(c.starts)}</div><small>Teams ${esc(c.team)} · ${c.registered} registered · Prize: <b>${esc(c.prize)}</b></small>
          <div class="row ck-foot"><button class="btn sm or" data-reg="solo">Register solo</button><button class="btn sm ink" data-reg="team">Register a team</button><button class="btn sm" data-sub>Submit</button></div></article>`).join("") || `<p class="muted">No competitions for this filter yet.</p>`; };
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
      $("#pf").innerHTML = `<div class="page-h"><div class="row"><span class="plogo big">${esc(p.name.split(" ").map(w => w[0]).join(""))}</span><div><div class="kicker">@${esc(p.handle)}</div><h1>${esc(p.name.toUpperCase())}</h1><p>${esc(p.bio)}</p><div class="row">${levelBadge(p.level)}<span class="tagx">${esc(p.role)}</span></div></div></div><div class="row"><a class="btn" data-wa-share="${esc(p.name)} on 101 Codecrafts:" href="#">${ico("wa")}Share profile</a><a class="btn or" href="/card.html">${ico("badge")}Make your member card</a></div></div>
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
    async signin() {
      const f = $("#si"), msg = $("#si-msg"), btn = $("button.or", f) || $("button", f);
      const say = (t, cls) => { msg.textContent = t; msg.className = "form-msg " + (cls || ""); };
      f.noValidate = true;
      f.onsubmit = async e => {
        e.preventDefault();
        const id = f.email.value.trim(), pw = f.password.value;
        const FE = window.CC_UI.fieldError; FE(f.email, ""); FE(f.password, ""); say("");
        if (!id) FE(f.email, "Enter your email or phone number.");
        else if (id.includes("@") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id)) FE(f.email, "That email address doesn't look right. Check for a missing @ or dot.");
        if (!pw) FE(f.password, "Enter your password.");
        const bad = f.querySelector("[aria-invalid=true]"); if (bad) { bad.focus(); return; }
        btn.disabled = true; const label = btn.textContent; btn.textContent = "Signing in…"; say("Checking your details…");
        const r = await API.signIn(id, pw);
        btn.disabled = false; btn.textContent = label;
        if (r) { say("Signed in. Taking you to your dashboard…", "ok"); setTimeout(() => location.href = "dashboard.html", 600); }
        else say("Sign-in opens when the 101 backend is live. This is the preview: you can explore the dashboard without an account.", "info");
      };
      const g = $("#si-google"); if (g) g.onclick = () => say("Google sign-in opens when the 101 backend is live.", "info");
    },
    async signup() {
      const f = $("#su"); const age = () => { const d = Date.parse(f.dob.value); return d ? (Date.now() - d) / 31557600000 : 99; };
      f.dob.onchange = () => { $("#guardian").hidden = age() >= 18; $$("#guardian input").forEach(i => i.required = age() < 18); };
      f.onsubmit = async e => { e.preventDefault(); const sm = $("#su-msg"); if (!f.checkValidity()) { if (sm) { sm.className = "form-msg err"; sm.textContent = "Some details need fixing. Check the messages under the fields."; } return; } if (sm) sm.textContent = "";
        if (sm) { sm.className = "form-msg info"; sm.textContent = "Accounts open when the 101 backend is live. Continuing to the onboarding preview…"; }
        const data = Object.fromEntries(new FormData(f)); if (age() < 18) await API.requestGuardianConsent({ child: data.email, guardian: data.g_email, phone: data.g_phone });
        await API.signUp(data); sessionStorage.setItem("cc_signup", JSON.stringify({ name: data.name, minor: age() < 18 })); location.href = "onboarding.html"; };
    },
    async onboarding() {
      const steps = $$(".step"); let i = 0; const show = () => { steps.forEach((s, j) => s.hidden = j !== i); $("#ob-n").textContent = `Step ${i + 1} of ${steps.length}`; $("#ob-back").disabled = i === 0; $("#ob-next").textContent = i === steps.length - 1 ? "Finish" : "Next"; };
      const pick = sel => $$(sel).forEach(b => b.onclick = () => { if (b.dataset.single !== undefined) $$(sel).forEach(x => x.setAttribute("aria-pressed", x === b)); else b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); if (b.dataset.role) { $("#tutor-levels").hidden = b.dataset.role !== "tutor"; $("#learner-level").hidden = b.dataset.role !== "learner"; } });
      pick("[data-role]"); pick("[data-mylevel]"); pick("[data-teach]"); pick("[data-int]");
      const s = JSON.parse(sessionStorage.getItem("cc_signup") || "{}"); if (s.minor) $("#minor-note").hidden = false;
      $("#ob-back").onclick = () => { i--; show(); };
      const FE = window.CC_UI.fieldError;
      const stepOk = () => { const st = steps[i]; let grp = null, msg = "";
        if (st.querySelector("[data-mylevel]") && !$("#learner-level").hidden && !$$("[data-mylevel][aria-pressed=true]").length) { grp = $("#learner-level .opts"); msg = "Pick the level that fits you best. You can change it later."; }
        else if (st.querySelector("[data-teach]") && !$("#tutor-levels").hidden && !$$("[data-teach][aria-pressed=true]").length) { grp = $("#tutor-levels .opts"); msg = "Pick at least one level you teach."; }
        $$(".opts[data-err-id]", st).forEach(o => { if (o !== grp) FE(o, ""); });
        if (grp) { FE(grp, msg); (grp.querySelector(".opt") || grp).focus(); return false; } return true; };
      $$(".opt").forEach(b => b.addEventListener("click", () => { const o = b.closest(".opts"); if (o && o.getAttribute("data-err-id")) FE(o, ""); }));
      $("#ob-next").onclick = async () => { if (!stepOk()) return; if (i < steps.length - 1) { i++; show(); return; }
        const val = sel => $$(sel + "[aria-pressed=true]").map(b => b.textContent.trim());
        await API.saveOnboarding({ role: val("[data-role]")[0], level: val("[data-mylevel]")[0], teaches: val("[data-teach]"), interests: val("[data-int]") });
        location.href = val("[data-role]")[0] === "Tutor" ? "tutor.html" : "dashboard.html"; };
      show();
    },
    /* ---------------- Course player ---------------- */
    async course() {
      const c = await API.fetchCourse(q.get("id") || "web-basics");
      /* r11 plans: lesson locks + rating gate (UI only; RLS on lessons is the authority). Never in ?static mockups. */
      const P = !STATIC && window.CC_PLANS;
      if (P) { await Promise.race([window.CCAccess && window.CCAccess.ready, new Promise(r => setTimeout(r, 2500))]); P.mergeSyllabus(c, await P.syllabus(c.id)); }
      const locked = i => !!(P && P.lessonLocked(c, c.lessons[i], i));
      const done = new Set(JSON.parse(localStorage.getItem("cc_done_" + c.id) || "null") || c.lessons.filter(l => l.done).map(l => l.id));
      let cur = Math.max(0, c.lessons.findIndex(l => l.id === q.get("lesson")) ); if (!q.get("lesson")) cur = Math.max(0, c.lessons.findIndex(l => !done.has(l.id)));
      $("#c-path").textContent = c.path; $("#c-title").textContent = c.title.toUpperCase();
      $("#c-meta").innerHTML = `${levelBadge(c.level)}<span class="tagx">Tutor: ${esc(c.tutor)}</span><span class="tagx">${c.lessons.length} lessons</span>`;
      const lite = () => document.documentElement.classList.contains("lite");
      const progress = () => { const p = Math.round(done.size / c.lessons.length * 100); $("#c-pct").textContent = `${p}% complete · ${done.size}/${c.lessons.length} lessons`; $("#c-bar").style.width = p + "%"; };
      const list = () => { $("#c-lessons").innerHTML = c.lessons.map((l, i) => { const lk = locked(i); return `<li><a href="?lesson=${l.id}" data-i="${i}" ${i === cur ? 'aria-current="true"' : ""}${lk ? ' class="is-locked"' : ""}><span class="tick ${done.has(l.id) ? "on" : ""}" role="img" aria-label="${lk ? "Locked on your plan" : done.has(l.id) ? "Completed" : "Not completed"}">${lk ? ico("lock") : done.has(l.id) ? ico("check") : i + 1}</span><span>${esc(l.title)}</span></a></li>`; }).join(""); };
      const video = l => {
        if (!l.yt) { $("#c-video").innerHTML = `<div class="facade"><div class="thumb-ph">${ico("clipboard")}</div><span class="play-lbl">Hands-on lesson · no video</span></div>`; return; }
        /* facade: only the thumbnail loads until the learner presses play (saves data); Lite mode uses the small thumbnail */
        const th = `https://i.ytimg.com/vi/${l.yt}/${lite() ? "mqdefault" : "hqdefault"}.jpg`;
        $("#c-video").innerHTML = `<button class="facade" type="button" aria-label="Play video: ${esc(l.title)}"><img src="${th}" alt="" loading="lazy" decoding="async"><span class="play">▶</span><span class="play-lbl">${lite() ? "Data saver on · tap to load video" : "Play lesson"}</span></button>`;
        $("#c-video .facade").onclick = () => { $("#c-video").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${l.yt}?autoplay=1&rel=0&modestbranding=1" title="${esc(l.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`; };
      };
      const show = () => { const l = c.lessons[cur]; $("#c-ltitle").textContent = `${cur + 1}. ${l.title}`; if (locked(cur)) $("#c-video").innerHTML = P.lockPanel(l, cur); else video(l); list(); progress();
        $("#c-done").disabled = locked(cur);
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
      $("#c-books").innerHTML = c.books.map(b => (STATIC ? `<a class="rcard book hov" href="${API.goHref(b.id)}" target="_blank" rel="noopener noreferrer">` : `<article class="rcard book ck ck--inv ck--flush">`) + `<div class="rthumb cover ck-media t-cy">${STATIC ? "" : `<span class="rt-fallback"><span class="rm-ic" aria-hidden="true">${window.CC_UI.ico("openbook")}</span><span class="rm-meta"><b>${esc(b.site)}</b><small>Book</small></span></span>`}<img src="${esc(b.cover)}${!STATIC && /covers\.openlibrary\.org/.test(b.cover) && !/default=/.test(b.cover) ? "?default=false" : ""}" alt="Cover of ${esc(b.title)}" loading="lazy" class="heavy${STATIC ? "" : " rt-img"}"${STATIC ? ' onerror="this.remove()"' : ""}><span class="badge-t ${b.open ? "cy" : ""}">${b.open ? "Free / open" : "Book"}</span></div><div class="rbody">` + (STATIC ? `<h3>${esc(b.title)}</h3>` : `<h3 class="ck-title"><a class="ck-link" href="${API.goHref(b.id)}" target="_blank" rel="noopener noreferrer">${esc(b.title)}<span class="sr-only">, on ${esc(b.site)} (opens in a new tab)</span></a></h3>`) + `<div class="src">${esc(b.author)}</div><span class="open ck-foot"${STATIC ? "" : ' aria-hidden="true"'}>Open on ${esc(b.site)} ↗</span></div>` + (STATIC ? `</a>` : `</article>`)).join("");
      const disc = () => $("#c-disc").innerHTML = c.discussion.map(d => `<div class="li"><span class="date">${esc(d.who.split(" ").map(w => w[0]).join(""))}</span><div class="grow"><b>${esc(d.who)}</b><small>${esc(d.t)} · ${esc(d.ago)} ago${d.replies ? " · " + d.replies + " replies" : ""}</small></div></div>`).join("");
      $("#c-dform").onsubmit = async e => { e.preventDefault(); const t = e.target.text.value.trim(); if (!t) return; c.discussion.unshift({ who: "You", t, ago: "now", replies: 0 }); disc(); e.target.reset(); await API.postDiscussion(c.id, t); };
      disc(); show();
      if (P) P.ratingCard(c, !!(c.enrolled || done.size));
    },
    /* ---------------- /go/<id> → original source ----------------
       Open-redirect guard: the id is looked up in our own catalogue (never a URL from the query string); the stored
       URL must parse as http(s) with no user:pass@ part. Shows the destination domain, auto-continues after 1.5s. */
    async go() {
      const id = q.get("id") || (location.pathname.match(/\/go\/([^/?#]+)/) || [])[1];
      let key = null; try { key = id && decodeURIComponent(id); } catch (e) {}
      let item = key && !q.get("missing") ? API.lookupGo(key) : null;
      if (key && !item && !q.get("missing")) { try { if (!window.__ccNewsCache) await API.fetchNews(); item = API.lookupGo(key); } catch (e) {} }
      let dest = null;
      try { const u = item && new URL(item.url); if (u && /^https?:$/.test(u.protocol) && !u.username && !u.password) dest = u; } catch (e) {}
      const back = $("#go-back"), sameRef = document.referrer && new URL(document.referrer).origin === location.origin;
      if (sameRef) back.href = document.referrer;
      if (!dest) {
        $("#go-card").classList.add("go-missing");
        $("#go-band").textContent = "Link not available"; $("#go-h").textContent = "We couldn't find that link";
        $("#go-lead").textContent = "It may have been removed from the Library, or the address was mistyped.";
        $("#go-status").textContent = ""; back.textContent = "Browse the Library"; back.href = "/resources.html"; back.classList.add("or");
        document.title = "Link not available · 101 Codecrafts"; return;
      }
      const host = dest.hostname.replace(/^www\./, ""), href = dest.href;
      $("#go-host").textContent = host; $("#go-url").textContent = href.replace(/^https?:\/\//, ""); $("#go-url").title = href;
      $("#go-lead").textContent = item.title ? "Opening \u201c" + item.title + "\u201d on " + host + "." : "You're heading to an external site.";
      const fav = $("#go-fav"), favSrc = item.favicon && /^https:\/\//.test(item.favicon) ? item.favicon : "https://www.google.com/s2/favicons?sz=64&domain=" + encodeURIComponent(dest.hostname);
      fav.onerror = () => { fav.onerror = null; fav.src = "/assets/icons/favicon-32.png"; }; fav.src = favSrc;
      $("#go-link").href = href;
      document.title = "Leaving for " + host + " · 101 Codecrafts";
      const MS = 1500, bar = $("#go-bar"), st = $("#go-status");
      bar.style.setProperty("--go-ms", MS + "ms"); bar.classList.add("run");
      st.textContent = "Taking you to " + host + "\u2026";
      let timer = setTimeout(() => { st.textContent = "Opening " + host + "\u2026"; location.replace(href); }, MS);
      const stop = (msg) => { if (!timer) return; clearTimeout(timer); timer = null; bar.classList.add("paused"); st.textContent = msg; };
      back.addEventListener("click", e => { stop("Cancelled."); if (sameRef && history.length > 1) { e.preventDefault(); history.back(); } });
      document.addEventListener("keydown", e => { if (e.key === "Escape") stop("Paused. Press Continue when you're ready."); });
    }
  };
  if (R[page]) R[page]();
})();
