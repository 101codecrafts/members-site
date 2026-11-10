/* 101 Practice & Learn — page logic for learn / article / practice / problem / ide / contests / contest / interview.
   Data via window.CC_PAPI (js/practice-api.js); editor via window.CC_EDITOR (js/code-editor.js). */
(function () {
  "use strict";
  const page = document.body.dataset.page, Q = new URLSearchParams(location.search);
  const API = window.CC_PAPI, D = window.CC_PRACTICE;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = (id, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const num = n => Number(n).toLocaleString("en-US");
  const dcls = d => "d-" + String(d).toLowerCase();
  const topicName = id => (D.TOPICS.find(t => t.id === id) || {}).name || id;
  const FLAME = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fc8c0c" d="M12 1c1 4-3 6-3 10a3 3 0 0 0 6 0c0-1-.4-2-1-3 3 1.5 5 4.5 5 8a7 7 0 0 1-14 0c0-6 6-8 7-15z"/><path fill="#ffd27a" d="M12 13c1.5 1.4 2.5 2.8 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.6 1.2-3 2.5-4.5z"/></svg>`;
  const fmtEAT = iso => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) + " EAT";
  const hms = ms => { ms = Math.max(0, ms) || 0;   /* never "NaN:NaN:NaN" (BUS Q7) */ const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3), p = n => String(n).padStart(2, "0"); return (d ? d + "d " : "") + `${p(h)}:${p(m)}:${p(s)}`; };
  const ticking = []; setInterval(() => ticking.forEach(f => f()), 1000);
  function tabs(root, onChange) {   /* roving tablist: arrows/Home/End move, Enter/Space or click selects */
    const ts = $$("[role=tab]", root);
    const sel = t => { ts.forEach(x => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; const p = x.getAttribute("aria-controls"); if (p && document.getElementById(p)) document.getElementById(p).hidden = !on; }); onChange && onChange(t); };
    ts.forEach((t, i) => { t.addEventListener("click", () => sel(t)); t.addEventListener("keydown", e => {
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ts.length - 1 }[e.key]; if (k == null) return; e.preventDefault(); const n = ts[(k + ts.length) % ts.length]; n.focus(); sel(n); }); });
    return sel;
  }
  function articleCard(a) {
    return `<article class="acard ck"><div class="atop ck-eyebrow"><span class="atopic">${esc(topicName(a.topic))}</span><span class="dpill ${a.level === "Beginner" ? "d-easy" : a.level === "Intermediate" ? "d-medium" : "d-hard"}">${esc(a.level)}</span></div>
      <h3 class="ck-title"><a class="ck-link" href="article.html?slug=${encodeURIComponent(a.slug)}">${esc(a.title)}</a></h3><p class="ck-body">${esc(a.desc)}</p><div class="ameta ck-meta ck-foot"><span>${esc(a.sub)}</span><span>${a.mins} min read</span><span>${esc(a.edu)}</span></div></article>`;
  }
  /* round 11: when the backend has nothing (and no ?static / admin ?demo), say so instead of drawing mock content */
  function unavailable(title, text, back) {
    const m = document.querySelector("main") || document.body;
    m.innerHTML = `<section class="wrap" style="padding:48px 0"><div class="card empty-state"><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p><p><a class="btn or" href="${back[0]}">${esc(back[1])}</a></p></div></section>`;
  }
  function toast(msg) { let t = $("#pr-toast"); if (!t) { t = document.createElement("div"); t.id = "pr-toast"; t.setAttribute("role", "status"); t.className = "sr-only"; document.body.appendChild(t); } t.textContent = ""; setTimeout(() => t.textContent = msg, 30); }

  /* =============================== LEARN =============================== */
  async function learn() {
    const st = { topic: Q.get("topic") || "all", sub: Q.get("sub") || "", level: "all", edu: "all", q: Q.get("q") || "" };
    const all = (await API.articles({})).items;
    const cnt = t => all.filter(a => a.topic === t).length;
    $("#ttree").innerHTML = `<h2 id="tt-h">Topics</h2><ul aria-labelledby="tt-h"><li><button type="button" data-topic="all">${ico("grid")}All topics<span class="n">${all.length}</span></button></li>` +
      D.TOPICS.map(t => `<li><button type="button" data-topic="${t.id}" aria-expanded="false">${ico(t.icon)}${esc(t.name)}<span class="n">${cnt(t.id)}</span></button><ul class="subs" hidden>${t.sub.map(s => `<li><button type="button" data-topic="${t.id}" data-sub="${esc(s)}">${esc(s)}</button></li>`).join("")}</ul></li>`).join("") + "</ul>";
    $("#lf-level").innerHTML = `<option value="all">All levels</option>` + D.LEVELS.map(l => `<option>${l}</option>`).join("");
    $("#lf-edu").innerHTML = `<option value="all">All education levels</option>` + D.EDU.map(l => `<option>${esc(l)}</option>`).join("");
    $("#lf-q").value = st.q;
    const render = async () => {
      $$("#ttree button").forEach(b => { const on = b.dataset.topic === st.topic && (b.dataset.sub || "") === st.sub; b.setAttribute("aria-current", on); if (!b.dataset.sub && b.dataset.topic !== "all") { const open = b.dataset.topic === st.topic; b.setAttribute("aria-expanded", open); b.nextElementSibling.hidden = !open; } });
      const r = await API.articles(st);
      $("#learn-h").textContent = st.topic === "all" ? "All tutorials" : topicName(st.topic) + (st.sub ? " · " + st.sub : "");
      $("#learn-n").textContent = `${r.total} article${r.total === 1 ? "" : "s"}`;
      $("#learn-grid").innerHTML = r.items.length ? r.items.map(articleCard).join("") : `<p class="muted empty">No articles match. Try another topic or clear the search.</p>`;
    };
    $("#ttree").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; st.topic = b.dataset.topic; st.sub = b.dataset.sub || ""; render(); });
    $("#lf-q").addEventListener("input", e => { st.q = e.target.value; render(); });
    $("#lf-level").addEventListener("change", e => { st.level = e.target.value; render(); });
    $("#lf-edu").addEventListener("change", e => { st.edu = e.target.value; render(); });
    render();
  }

  /* =============================== ARTICLE =============================== */
  const LNAME = { cpp: "C++", java: "Java", python: "Python", javascript: "JavaScript", c: "C" };
  async function article() {
    const a = Q.get("slug") ? await API.article(Q.get("slug")) : null;
    if (!a) { unavailable("Article not available", "This tutorial isn't published yet, or the library can't be reached right now.", ["learn.html", "Browse tutorials"]); return; }
    document.title = a.title + " · 101 Learn";
    const same = API.demoOK() ? D.articles.filter(x => x.topic === a.topic) : [];
    $("#art-crumbs").innerHTML = `<a href="learn.html">Learn</a> / <a href="learn.html?topic=${a.topic}">${esc(topicName(a.topic))}</a> / <span aria-current="page">${esc(a.title)}</span>`;
    $("#art-nav").innerHTML = `<h2>${esc(topicName(a.topic))}</h2>` + same.map(x => `<a href="article.html?slug=${x.slug}"${x.slug === a.slug ? ' aria-current="page"' : ""}>${esc(x.title)}</a>`).join("");
    $("#art-toc").innerHTML = `<h2>On this page</h2>` + a.sections.map(s => `<a href="#${s.id}">${esc(s.h)}</a>`).join("");
    let cb = 0;
    const codeBlock = code => {
      const id = "cb" + (cb++), langs = Object.keys(code);
      return `<div class="codeblock" data-cb="${id}"><div class="cb-bar"><div role="tablist" aria-label="Language" class="row" style="gap:6px">${langs.map((l, i) => `<button role="tab" type="button" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}" aria-controls="${id}-${l}" data-lang="${l}">${LNAME[l]}</button>`).join("")}</div><span class="sp"></span>
        <button class="btn sm" type="button" data-act="copy">${ico("clipboard")}Copy</button><button class="btn sm cy" type="button" data-act="ide">${ico("codebox")}Run in IDE</button><button class="btn sm or" type="button" data-act="explain">${ico("brain")}Explain with 101 AI</button></div>
        ${langs.map((l, i) => `<pre id="${id}-${l}" role="tabpanel" tabindex="0" aria-label="${LNAME[l]} code"${i ? " hidden" : ""}><code>${esc(code[l])}</code></pre>`).join("")}<div class="ai-out" aria-live="polite"></div></div>`;
    };
    $("#art-body").innerHTML = `<div class="crumbs" id="art-crumbs2"></div><h1>${esc(a.title)}</h1>
      <div class="ahead"><span class="atopic" style="background:var(--cy);padding:2px 8px;color:var(--ink)">${esc(a.sub)}</span><span>${esc(a.level)}</span><span>${a.mins} min read</span><span>By ${esc(a.author)}</span><span>Updated ${esc(a.updated)}</span><span>${num(a.views)} views</span></div>` +
      a.sections.map(s => `<section id="${s.id}" aria-labelledby="${s.id}-h"><h2 id="${s.id}-h">${esc(s.h)}</h2>${(s.p || []).map(p => `<p>${p}</p>`).join("")}${s.example ? `<pre class="ex">${esc(s.example)}</pre>` : ""}${s.list ? `<ul>${s.list.map(li => `<li>${esc(li)}</li>`).join("")}</ul>` : ""}${s.code ? codeBlock(s.code) : ""}</section>`).join("") +
      `<div class="art-foot"><span class="muted">Found a mistake or have a better explanation?</span><button class="btn" type="button" id="imp-open" aria-expanded="false" aria-controls="imp-form">${ico("doc")}Improve this article</button></div>
      <form class="improve" id="imp-form" hidden><label class="field">Section<select name="section">${a.sections.map(s => `<option value="${s.id}">${esc(s.h)}</option>`).join("")}</select></label>
      <label class="field">Your suggestion<textarea name="suggestion" rows="4" required placeholder="What should change, and why?"></textarea></label><div class="row"><button class="btn ink" type="submit">Send for review</button><span role="status" class="muted" id="imp-msg"></span></div></form>`;
    $$(".codeblock").forEach(b => {
      let lang = $("[role=tab]", b).dataset.lang;
      tabs(b, t => lang = t.dataset.lang);
      const code = () => $(`pre:not([hidden]) code`, b).textContent;
      b.addEventListener("click", async e => {
        const btn = e.target.closest("[data-act]"); if (!btn) return;
        if (btn.dataset.act === "copy") { try { await navigator.clipboard.writeText(code()); } catch (er) { /* clipboard blocked */ } btn.lastChild.textContent = "Copied"; toast("Code copied"); setTimeout(() => btn.lastChild.textContent = "Copy", 1500); }
        if (btn.dataset.act === "ide") { sessionStorage.setItem("cc_ide", JSON.stringify({ lang, code: code() })); location.href = "ide.html?from=" + encodeURIComponent(a.slug); }
        if (btn.dataset.act === "explain") { const out = $(".ai-out", b); out.innerHTML = `<div class="ai-box"><b>${ico("brain")}101 AI</b>Thinking…</div>`; const r = await API.aiExplain({ articleSlug: a.slug, code: code(), lang }); out.innerHTML = `<div class="ai-box"><b>${ico("brain")}101 AI explains</b>${esc(r.explanation)}</div>`; }
      });
    });
    const io = $("#imp-open"), f = $("#imp-form");
    io.onclick = () => { f.hidden = !f.hidden; io.setAttribute("aria-expanded", !f.hidden); if (!f.hidden) $("select", f).focus(); };
    f.onsubmit = async e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(f)); const r = await API.improve(a.slug, fd); $("#imp-msg").textContent = r.status === "pending_review" ? "Thanks! Sent to the editors for review." : "Not sent (offline). Try again in a moment."; f.reset(); };
    $("#art-related").innerHTML = D.articles.filter(x => x.topic === a.topic && x.slug !== a.slug).concat(D.articles.filter(x => x.topic !== a.topic)).slice(0, 4).map(articleCard).join("");
    const cm = (await API.comments(a.slug)).items;
    const cHTML = c => `<div class="cmt"><span class="av" aria-hidden="true">${esc(c.av)}</span><div class="cb"><b>${esc(c.user)}</b> <small>· ${esc(c.ago)} ago</small><p>${esc(c.text)}</p>${c.likes != null ? `<button class="lbtn" type="button" aria-pressed="false">${ico("heart", "i")}<span class="sr-only">Like</span> ${c.likes}</button>` : ""}${c.reply ? `<div class="reply">${cHTML(c.reply)}</div>` : ""}</div></div>`;
    $("#cmt-list").innerHTML = cm.map(cHTML).join(""); $("#cmt-n").textContent = cm.length;
    $("#cmt-form").onsubmit = async e => { e.preventDefault(); const AC = window.CCAccess; if (AC && !AC.can("community.post")) { location.href = AC.role === "visitor" ? AC.authUrl(location.pathname + location.search) : (AC.denyTarget && AC.denyTarget("community.post")) || AC.authUrl(location.pathname + location.search, "upgrade=1"); return; } const t = $("#cmt-text").value.trim(); if (!t) { $("#cmt-text").focus(); toast("Write a comment first."); return; } let c; try { c = await API.addComment(a.slug, t); } catch (err) { toast(err.message); return; } $("#cmt-list").insertAdjacentHTML("afterbegin", cHTML(c)); $("#cmt-text").value = ""; toast("Comment posted"); };
    $("#cmt-list").addEventListener("click", e => { const b = e.target.closest(".lbtn"); if (!b) return; const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on); const n = b.lastChild; n.textContent = " " + (parseInt(n.textContent) + (on ? 1 : -1)); });
    if ("IntersectionObserver" in window) { const links = $$("#art-toc a"); const ob = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) links.forEach(l => l.classList.toggle("on", l.getAttribute("href") === "#" + en.target.id)); }), { rootMargin: "-20% 0px -70% 0px" }); $$(".art section").forEach(s => ob.observe(s)); }
  }

  /* =============================== PRACTICE =============================== */
  async function practice() {
    const [potd0, pg0, list] = await Promise.all([API.potd(), API.progress(), API.problems({})]);
    /* real zeros for a fresh account / unreachable backend: no fake streaks, ranks or scores */
    const pg = pg0 || { rank: null, codingScore: 0, solved: 0, byDifficulty: {}, byTopic: [], empty: true };
    const potd = potd0 && { ...potd0, streak: potd0.streak ?? pg.streak ?? 0, bestStreak: potd0.bestStreak ?? pg.bestStreak ?? 0 };   // streak lives in progress
    if (!potd) $("#potd").innerHTML = `<div class="kicker">Problem of the Day</div><h2>No problem of the day yet</h2><p class="muted">When the daily problem is published it shows here, with your streak.</p>`;
    if (potd) {
    $("#potd").innerHTML = `<div class="kicker">Problem of the Day · ${esc(potd.date)}</div><h2>${esc(potd.title)}</h2>
      <div class="prow"><span class="dpill ${dcls(potd.difficulty)}">${esc(potd.difficulty)}</span><span>${esc(potd.topic)}</span><span class="cdown" id="potd-cd" aria-live="off"></span></div>
      <div class="prow" style="justify-content:space-between"><div class="flame">${FLAME}<div><b>${potd.streak}</b> <small>day streak<br>best ${potd.bestStreak}</small></div></div>
      <a class="btn or" href="problem.html?id=${encodeURIComponent(potd.problemId)}">${potd.solvedToday ? "Solved ✓ — view" : "Solve now"}${ico("arrow")}</a></div>
      <small style="color:#c9d3db">Solve before midnight EAT to keep your streak.</small>`;
    const cd = () => { const el = $("#potd-cd"); if (el) el.textContent = "Ends in " + hms(Date.parse(potd.endsAt) - Date.now()); }; cd(); ticking.push(cd);
    }
    if (pg.empty) { $("#cscore").innerHTML = `<div class="sec-title"><h2>Coding score</h2></div><p class="muted">0 points so far. Solve a problem to start your score and rank.</p>`; $("#rings").innerHTML = `<div class="sec-title"><h2>Progress by topic</h2></div><p class="muted">Nothing solved yet. Your progress by topic appears here.</p>`; }
    else {
    const bd = pg.byDifficulty, clr = { Easy: "var(--success-text)", Medium: "var(--or)", Hard: "var(--danger-text)" };
    $("#cscore").innerHTML = `<div class="sec-title"><h2>Coding score</h2>${pg.rank ? `<span class="tagx">Rank #${num(pg.rank)}</span>` : ""}</div><div class="cscore"><div class="row" style="align-items:flex-end;gap:16px"><span class="big">${pg.codingScore}</span><span class="muted"><b style="color:var(--ink)">${pg.solved}</b> solved${pg.attempted != null ? ` · ${pg.attempted} attempted` : ""}${pg.institute && pg.institute.rank ? `<br>#${pg.institute.rank} at ${esc(pg.institute.name)}` : ""}</span></div>
      <div class="dbars">${Object.entries(bd).map(([k, v]) => `<div class="dbar"><span class="${dcls(k)}">${k}</span><div class="prog" role="progressbar" aria-label="${k} solved" aria-valuemin="0" aria-valuemax="${v.total || v.solved}" aria-valuenow="${v.solved}"><i style="width:${v.total ? (v.solved / v.total * 100).toFixed(1) : 100}%;background:${clr[k]}"></i></div><span>${v.total ? `${v.solved}/${v.total}` : v.solved}</span></div>`).join("")}</div></div>`;
    const C = 2 * Math.PI * 26;
    $("#rings").innerHTML = `<div class="sec-title"><h2>Progress by topic</h2></div><div class="rings">${pg.byTopic.map(t => { const p = t.solved / t.total; return `<div class="ring" role="img" aria-label="${esc(t.topic)}: ${t.solved} of ${t.total} solved"><svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="26" fill="none" stroke-width="7"/><circle class="fg" cx="32" cy="32" r="26" fill="none" stroke-width="7" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}"/></svg><span class="pct">${Math.round(p * 100)}%</span><span>${esc(t.topic)}<br><small class="muted">${t.solved}/${t.total}</small></span></div>`; }).join("")}</div>`;
    }
    const topics = [...new Set(list.items.map(p => p.topic))].sort();
    $("#pf-topic").innerHTML = `<option value="all">All topics</option>` + topics.map(t => `<option>${esc(t)}</option>`).join("");
    $("#pf-co").innerHTML = `<option value="all">All companies</option>` + D.COMPANIES.map(t => `<option>${esc(t)}</option>`).join("");
    const st = { q: "", diff: "all", topic: Q.get("topic") || "all", co: "all", status: "all" };
    const render = () => {
      const s = st.q.toLowerCase();
      const rows = list.items.filter(p => (st.diff === "all" || p.difficulty === st.diff) && (st.topic === "all" || p.topic === st.topic) && (st.co === "all" || p.companies.includes(st.co)) && (st.status === "all" || (st.status === "todo" ? !p.status : p.status === st.status)) && (!s || p.title.toLowerCase().includes(s)));
      $("#pt-n").textContent = `${rows.length} of ${list.items.length} problems`;
      $("#pt-body").innerHTML = rows.length ? rows.map(p => `<tr><td><span class="st ${p.status}" title="${p.status || "Not attempted"}">${p.status === "solved" ? ico("check") : p.status === "attempted" ? "•" : ""}<span class="sr-only">${p.status || "Not attempted"}</span></span></td>
        <td><a class="ptitle" href="problem.html?id=${encodeURIComponent(p.id)}">${esc(p.title)}</a>${p.local ? `<span class="loc">UG</span>` : ""}<div class="ctags hide-sm" style="margin-top:4px">${p.companies.map(c => `<span>${esc(c)}</span>`).join("")}</div></td>
        <td><span class="dpill ${dcls(p.difficulty)}">${p.difficulty}</span></td><td class="hide-sm">${esc(p.topic)}</td><td class="hide-sm">${p.accuracy}%</td><td class="hide-sm">${num(p.submissions)}</td><td>${p.score}</td></tr>`).join("") : `<tr><td colspan="7" class="muted">No problems match these filters.</td></tr>`;
    };
    $("#pf-q").oninput = e => { st.q = e.target.value; render(); };
    [["#pf-diff", "diff"], ["#pf-topic", "topic"], ["#pf-co", "co"], ["#pf-status", "status"]].forEach(([s, k]) => { $(s).value = st[k]; $(s).onchange = e => { st[k] = e.target.value; render(); }; });
    render();
  }

  /* =============================== PROBLEM =============================== */
  async function problem() {
    const p = Q.get("id") ? await API.problem(Q.get("id")) : null;
    if (!p) { unavailable("Problem not available", "This problem isn't published yet, or the practice library can't be reached right now.", ["practice.html", "Back to practice"]); return; }
    document.title = p.title + " · 101 Practice";
    $("#p-title").textContent = p.title;
    $("#p-meta").innerHTML = `<span class="dpill ${dcls(p.difficulty)}">${p.difficulty}</span><span>${esc(p.topic)}</span><span>Accuracy ${p.accuracy}%</span><span>${num(p.submissions)} submissions</span><span>Score ${p.score}</span><span>${esc(p.timeLimit)} · ${esc(p.memoryLimit)}</span><div class="ctags">${p.companies.map(c => `<span>${esc(c)}</span>`).join("")}</div>`;
    $("#tp-statement").innerHTML = p.statement + p.examples.map((e, i) => `<h3>Example ${i + 1}</h3><div class="exbox"><div><b>Input</b><pre>${esc(e.input)}</pre></div><div><b>Output</b><pre>${esc(e.output)}</pre></div>${e.explain ? `<div><b>Why</b><pre>${esc(e.explain)}</pre></div>` : ""}</div>`).join("");
    $("#tp-examples").innerHTML = p.examples.map((e, i) => `<h3>Sample ${i + 1}</h3><div class="exbox"><div><b>stdin</b><pre>${esc(e.input)}</pre></div><div><b>stdout</b><pre>${esc(e.output)}</pre></div></div>`).join("") + `<p class="muted">Run uses these samples. Submit runs the full hidden test set.</p>`;
    $("#tp-constraints").innerHTML = `<ul style="padding-left:20px">${p.constraints.map(c => `<li><code>${esc(c)}</code></li>`).join("")}</ul><p><b>Time limit:</b> ${esc(p.timeLimit)} · <b>Memory:</b> ${esc(p.memoryLimit)}</p>`;
    $("#tp-editorial").innerHTML = `<details class="hint"><summary>Reveal editorial (spoilers)</summary><div style="padding:4px 12px 10px">${p.editorial}</div></details>`;
    $("#tp-hints").innerHTML = p.hints.map((h, i) => `<details class="hint"><summary>Hint ${i + 1}</summary><p>${esc(h)}</p></details>`).join("");
    tabs($("#ptabs"));
    const langSel = $("#lang"), key = l => `cc_code_${p.id}_${l}`;
    langSel.innerHTML = D.LANGS.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
    langSel.value = localStorage.getItem("cc_lang") || "cpp";
    const ed = window.CC_EDITOR.create($("#editor"), { lang: langSel.value, value: localStorage.getItem(key(langSel.value)) || p.starter[langSel.value], label: "Solution code", onChange: v => localStorage.setItem(key(langSel.value), v) });
    langSel.onchange = () => { const l = langSel.value; localStorage.setItem("cc_lang", l); ed.setLang(l); ed.set(localStorage.getItem(key(l)) || p.starter[l]); };
    $("#reset").onclick = () => { if (confirm("Reset to the starter code? Your code for this language will be lost.")) { localStorage.removeItem(key(langSel.value)); ed.set(p.starter[langSel.value]); } };
    const res = $("#res-b"); let lastFail = null, hintLvl = 0;
    const busy = on => $$("#run,#submit").forEach(b => b.disabled = on);
    const caseHTML = (c, i) => `<div class="case ${c.pass ? "pass" : "fail"}"><h4>${c.pass ? ico("check") : ico("xmark")} Case ${i + 1} — ${c.pass ? "passed" : "failed"}</h4><div class="kv"><b>Input</b><pre>${esc(c.input)}</pre><b>Expected</b><pre>${esc(c.expected)}</pre><b>Your output</b><pre>${esc(c.output)}</pre></div></div>`;
    $("#run").onclick = async () => { busy(true); $("#res").hidden = false; res.innerHTML = `<span class="verdict run">Running sample tests…</span>`;
      const r = await API.run(p.id, langSel.value, ed.get()); busy(false); if (r.offline) { res.innerHTML = `<div class="verdict bad">${esc(r.verdict)}</div><p class="muted">${esc(r.message)}</p>`; return; } const ok = r.cases.length > 0 && r.cases.every(c => c.pass); lastFail = ok ? null : r.cases.find(c => !c.pass);
      res.innerHTML = `<div class="verdict ${ok ? "ok" : "bad"}">${esc(r.verdict)}</div><div class="vstats"><span>Runtime <b>${r.runtimeMs} ms</b></span><span>Memory <b>${(r.memoryKb / 1024).toFixed(1)} MB</b></span><span>${r.cases.filter(c => c.pass).length}/${r.cases.length} samples</span></div>${r.cases.map(caseHTML).join("")}${r.mock ? `<p class="mock-note">Preview judge (mock) — the live runner executes your code in a sandbox.</p>` : ""}`; };
    $("#submit").onclick = async () => { busy(true); $("#res").hidden = false; res.innerHTML = `<span class="verdict run">Judging against all tests…</span>`;
      const r = await API.submit(p.id, langSel.value, ed.get()); busy(false); if (r.offline) { res.innerHTML = `<div class="verdict bad">${esc(r.verdict)}</div><p class="muted">${esc(r.message)}</p>`; return; } const ok = r.verdict === "Accepted"; lastFail = r.failedCase;
      res.innerHTML = `<div class="verdict ${ok ? "ok" : "bad"}">${esc(r.verdict)}${ok && r.scoreDelta ? ` <small style="font:700 var(--step--1) var(--body);color:var(--ink)">+${r.scoreDelta} coding score</small>` : ""}</div>
        <div class="vstats"><span>Tests <b>${r.passed}/${r.total}</b></span><span>Runtime <b>${r.runtimeMs} ms</b></span><span>Memory <b>${(r.memoryKb / 1024).toFixed(1)} MB</b></span></div>
        ${r.failedCase ? `<div class="case fail"><h4>${ico("xmark")} Failed on test ${r.failedCase.index}</h4><div class="kv"><b>Input</b><pre>${esc(r.failedCase.input)}</pre><b>Expected</b><pre>${esc(r.failedCase.expected)}</pre><b>Your output</b><pre>${esc(r.failedCase.output)}</pre></div></div>` : ""}${r.mock ? `<p class="mock-note">Preview judge (mock) — the live runner executes your code in a sandbox.</p>` : ""}`; };
    $("#hint").onclick = async () => { $("#res").hidden = false; res.innerHTML = `<div class="ai-box"><b>${ico("brain")}101 AI hint</b>Thinking…</div>`; const r = await API.aiHint({ problemId: p.id, code: ed.get(), lang: langSel.value, level: hintLvl++ }); res.innerHTML = `<div class="ai-box"><b>${ico("brain")}101 AI hint ${hintLvl}</b>${esc(r.hint)}</div>`; };
    $("#debug").onclick = async () => { $("#res").hidden = false; res.innerHTML = `<div class="ai-box"><b>${ico("brain")}Debug with 101 AI</b>Reading your code…</div>`; const r = await API.aiDebug({ problemId: p.id, code: ed.get(), lang: langSel.value, failedCase: lastFail }); res.innerHTML = `<div class="ai-box"><b>${ico("brain")}Debug with 101 AI</b><p>${esc(r.explanation)}</p><p><b style="display:inline">Try:</b> ${esc(r.suggestion)}</p></div>`; };
    $("#res-close").onclick = () => { $("#res").hidden = true; };
    document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); (e.shiftKey ? $("#submit") : $("#run")).click(); } });
    splitter($(".psplit"), $("#gutter"));
  }
  function splitter(wrap, g) {
    if (!wrap || !g) return; let pct = 50;
    const set = v => { pct = Math.min(75, Math.max(25, v)); wrap.style.gridTemplateColumns = `minmax(0,${pct}fr) 8px minmax(0,${100 - pct}fr)`; g.setAttribute("aria-valuenow", Math.round(pct)); };
    g.addEventListener("pointerdown", e => { g.setPointerCapture(e.pointerId); const r = wrap.getBoundingClientRect(); const mv = ev => set((ev.clientX - r.left) / r.width * 100); g.onpointermove = mv; g.onpointerup = () => { g.onpointermove = null; }; });
    g.addEventListener("keydown", e => { const d = { ArrowLeft: -5, ArrowRight: 5 }[e.key]; if (d) { e.preventDefault(); set(pct + d); } });
  }

  /* =============================== IDE =============================== */
  const HELLO = { cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    string name;\n    getline(cin, name);\n    cout << "Hello, " << name << "!" << endl;\n    return 0;\n}\n', c: '#include <stdio.h>\n\nint main(void) {\n    char name[100];\n    fgets(name, sizeof name, stdin);\n    printf("Hello, %s", name);\n    return 0;\n}\n', java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.println("Hello, " + sc.nextLine() + "!");\n    }\n}\n', python: 'name = input()\nprint(f"Hello, {name}!")\n', javascript: "const name = require('fs').readFileSync(0, 'utf8').trim();\nconsole.log(`Hello, ${name}!`);\n" };
  function ide() {
    const sel = $("#lang"); sel.innerHTML = D.LANGS.map(l => `<option value="${l.id}">${l.name}</option>`).join("");
    let init = null; try { init = JSON.parse(sessionStorage.getItem("cc_ide") || "null"); sessionStorage.removeItem("cc_ide"); } catch (e) { /* ignore */ }
    sel.value = (init && init.lang) || Q.get("lang") || localStorage.getItem("cc_lang") || "python";
    const saved = l => localStorage.getItem("cc_ide_" + l);
    const ed = window.CC_EDITOR.create($("#editor"), { lang: sel.value, value: (init && init.code) || saved(sel.value) || HELLO[sel.value], label: "Program source", onChange: v => localStorage.setItem("cc_ide_" + sel.value, v) });
    if (init && Q.get("from")) $("#ide-from").innerHTML = `Loaded from <a href="article.html?slug=${encodeURIComponent(Q.get("from"))}" style="color:var(--color-link);text-decoration:underline">the article</a>.`;
    sel.onchange = () => { ed.setLang(sel.value); ed.set(saved(sel.value) || HELLO[sel.value]); };
    $("#stdin").value = Q.get("stdin") || "101 Codecrafts";
    const out = $("#stdout");
    $("#run").onclick = async () => { $("#run").disabled = true; out.textContent = "Running…"; $("#ide-stat").textContent = "";
      const r = await API.execute(sel.value, ed.get(), $("#stdin").value); $("#run").disabled = false;
      out.innerHTML = esc(r.stdout) + (r.stderr ? `<span class="err">${esc(r.stderr)}</span>` : "");
      $("#ide-stat").textContent = `exit ${r.exitCode} · ${r.runtimeMs} ms · ${(r.memoryKb / 1024).toFixed(1)} MB${r.mock ? " · mock runner" : ""}`; };
    $("#clear").onclick = () => { out.textContent = ""; $("#ide-stat").textContent = ""; };
    $("#dl").onclick = () => { const ext = { cpp: "cpp", c: "c", java: "java", python: "py", javascript: "js" }[sel.value]; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ed.get()], { type: "text/plain" })); a.download = (sel.value === "java" ? "Main" : "main") + "." + ext; a.click(); };
    document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); $("#run").click(); } });
  }

  /* =============================== CONTESTS =============================== */
  async function contests() {
    const items = (await API.contests()).items;
    const card = c => {
      const live = c.status === "live", up = c.status === "upcoming";
      return `<article class="ct ck${live ? " live ck--inv" : ""}" data-id="${c.id}">
        <div class="row" style="justify-content:space-between">${live ? `<span class="livedot">LIVE</span>` : `<span class="tagx">${up ? "Upcoming" : "Finished"}</span>`}${c.rated ? `<span class="tagx">Rated</span>` : `<span class="tagx">Unrated</span>`}</div>
        <h3>${esc(c.name)}</h3><div class="when">${fmtEAT(c.start)} · ${Math.round((Date.parse(c.end) - Date.parse(c.start)) / 6e4)} min · ${c.problems} problems</div>
        ${c.prize ? `<div class="muted" style="font-weight:700">${ico("trophy", "i")} ${esc(c.prize)}</div>` : ""}
        ${live || up ? `<div><small class="when">${live ? "Ends in" : "Starts in"}</small><div class="timer" data-t="${live ? c.end : c.start}" aria-live="off"></div></div>` : `<div class="when">${num(c.participants)} took part${c.myRank ? ` · your rank <b style="color:var(--ink)">#${c.myRank}</b>` : ""}</div>`}
        <div class="row">${live ? `<a class="btn or" href="contest.html?id=${c.id}">Enter contest</a><a class="btn" href="contest.html?id=${c.id}#lb" style="background:transparent;color:#fff;border-color:#fff">Leaderboard</a>` : up ? `<button class="btn ink" type="button" data-reg="${c.id}">Register</button><span class="muted">${num(c.registered)} registered</span>` : `<a class="btn" href="contest.html?id=${c.id}">Results &amp; editorials</a>`}</div></article>`;
    };
    ["live", "upcoming", "past"].forEach(s => { const l = items.filter(c => c.status === s); $("#ct-" + s).innerHTML = l.length ? l.map(card).join("") : `<p class="muted">Nothing here right now.</p>`; });
    const tick = () => $$(".timer[data-t]").forEach(t => t.textContent = hms(Date.parse(t.dataset.t) - Date.now())); tick(); ticking.push(tick);
    document.addEventListener("click", async e => { const b = e.target.closest("[data-reg]"); if (!b) return; b.disabled = true; const rr = await API.register(b.dataset.reg); if (!rr || !rr.registered) { b.disabled = false; toast("Not registered (offline). Try again."); return; } b.textContent = "Registered ✓"; toast("Registered for the contest"); });
  }
  async function contest() {
    const c = Q.get("id") ? await API.contest(Q.get("id")) : null;
    if (!c) { unavailable("Contest not available", "This contest isn't published, or contests can't be reached right now.", ["contests.html", "All contests"]); return; }
    document.title = c.name + " · 101 Contests";
    $("#c-name").textContent = c.name;
    $("#c-when").textContent = `${fmtEAT(c.start)} → ${fmtEAT(c.end)} · ${c.rated ? "Rated" : "Unrated"} · ICPC-style scoring with time penalty`;
    const t = () => { const now = Date.now(), live = now < Date.parse(c.end) && now >= Date.parse(c.start), up = now < Date.parse(c.start); $("#c-live").hidden = !live; $("#c-timer").innerHTML = `<small>${live ? "TIME LEFT" : up ? "STARTS IN" : "CONTEST OVER"}</small>${live ? hms(Date.parse(c.end) - now) : up ? hms(Date.parse(c.start) - now) : "00:00:00"}`; }; t(); ticking.push(t);
    $("#c-probs").innerHTML = c.problems.map(p => `<tr><td><b>${p.code}</b></td><td><a class="ptitle" href="problem.html?id=pair-sum-sorted&contest=${encodeURIComponent(c.id)}">${esc(p.title)}</a></td><td>${p.pts}</td></tr>`).join("");
    const lb = async () => {
      const r = await API.leaderboard(c.id);
      $("#lb-head").innerHTML = `<tr><th scope="col">#</th><th scope="col">Name</th><th scope="col" class="hide-sm">Institution</th><th scope="col">Score</th><th scope="col">Solved</th><th scope="col" class="hide-sm">Penalty</th>${c.problems.map(p => `<th scope="col" class="c">${p.code}</th>`).join("")}</tr>`;
      $("#lb-body").innerHTML = r.items.map(x => `<tr class="${x.me ? "me" : ""} ${x.rank === 1 ? "r1" : ""}"><td><b>${x.rank}</b></td><td><b>${esc(x.user)}</b>${x.me ? ' <span class="tagx">You</span>' : ""}</td><td class="hide-sm">${esc(x.org)}</td><td><b>${x.score}</b></td><td>${x.solved}</td><td class="hide-sm mono">${x.penalty}</td>${x.cells.map(v => `<td class="c ${v > 0 ? "ac" : v < 0 ? "wa" : ""}">${v > 0 ? "✓" + (v > 1 ? `<small>(${v - 1})</small>` : "") : v < 0 ? "✗" + -v : "–"}<span class="sr-only">${v > 0 ? "accepted" : v < 0 ? -v + " wrong attempts" : "not attempted"}</span></td>`).join("")}</tr>`).join("");
      $("#lb-upd").textContent = "Updated " + new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(r.updatedAt)) + " EAT · refreshes every 30 s";
    };
    lb(); if (!API.STATIC) setInterval(lb, 30000);
    $("#lb-refresh").onclick = () => { lb(); toast("Leaderboard refreshed"); };
  }

  /* =============================== INTERVIEW =============================== */
  async function interview() {
    const r0 = await API.companies(); const r = { items: ((r0 && r0.items) || []).map(c => ({ ...c, tags: c.tags || [] })), sets: (r0 && r0.sets) || [] }; let co = Q.get("company") || "all";
    $("#co-grid").innerHTML = `<button class="co" type="button" data-co="all" aria-pressed="false"><b>All</b><small>${r.sets.length} sets</small></button>` + r.items.map(c => `<button class="co" type="button" data-co="${c.id}" aria-pressed="false"><b>${esc(c.name)}</b><small>${c.sets} problems · ${c.mcq} MCQs</small><small>${c.tags.map(esc).join(" · ")}</small></button>`).join("");
    const render = () => { $$(".co").forEach(b => b.setAttribute("aria-pressed", b.dataset.co === co)); const l = r.sets.filter(s => co === "all" || s.company === co);
      $("#sets").innerHTML = l.length ? l.map(s => `<article class="acard ck"><div class="atop ck-eyebrow"><span class="atopic">${esc((r.items.find(c => c.id === s.company) || {}).name)}</span><span class="dpill ${dcls(s.level)}">${s.level}</span></div><h3 class="ck-title"><a class="ck-link" href="practice.html?company=${encodeURIComponent(s.company)}">${esc(s.title)}</a></h3><div class="ameta ck-meta ck-foot"><span>${s.problems} questions</span><span>${s.mins} min</span></div></article>`).join("") : `<p class="muted">No sets for this company yet — the quiz below is a good warm-up.</p>`; };
    $("#co-grid").onclick = e => { const b = e.target.closest(".co"); if (b) { co = b.dataset.co; render(); } }; render();
    const qz = await API.quiz("dsa-basics-1"); let i = 0, score = 0;
    if (!qz || !Array.isArray(qz.questions) || !qz.questions.length) { $("#qz-title").textContent = "Warm-up quiz"; $("#quiz").innerHTML = `<p class="muted">No quiz is published yet. Check back soon.</p>`; return; }
    $("#qz-title").textContent = qz.title;
    const show = () => {
      if (i >= qz.questions.length) { $("#quiz").innerHTML = `<div class="verdict ${score >= 4 ? "ok" : "run"}">You scored ${score}/${qz.questions.length}</div><p class="muted">${score >= 4 ? "Strong! Try a company set next." : "Read the linked tutorials and try again."}</p><div class="row"><button class="btn or" type="button" id="qz-again">Try again</button><a class="btn" href="learn.html?topic=dsa">DSA tutorials</a></div>`; $("#qz-again").onclick = () => { i = 0; score = 0; show(); }; $("#qz-again").focus(); return; }
      const q = qz.questions[i];
      $("#quiz").innerHTML = `<div class="qbar"><span class="tagx">Question ${i + 1} of ${qz.questions.length}</span><span class="muted">Score ${score}</span></div><div class="prog" role="progressbar" aria-label="Quiz progress" aria-valuemin="0" aria-valuemax="${qz.questions.length}" aria-valuenow="${i}"><i style="display:block;height:100%;width:${i / qz.questions.length * 100}%;background:var(--or)"></i></div>
        <fieldset style="border:0;display:grid;gap:12px"><legend class="qq" id="qq">${esc(q.q)}</legend><div class="qopts">${q.options.map((o, k) => `<button class="qopt" type="button" data-k="${k}"><span class="k">${"ABCD"[k]}</span>${esc(o)}</button>`).join("")}</div></fieldset><div id="qfb" aria-live="polite"></div>`;
      if (i > 0) $(".qopt").focus();
      $(".qopts").onclick = e => { const b = e.target.closest(".qopt"); if (!b || b.disabled) return; const k = +b.dataset.k, ok = k === q.answer; if (ok) score++;
        $$(".qopt").forEach(x => { x.disabled = true; if (+x.dataset.k === q.answer) x.classList.add("right"); }); if (!ok) b.classList.add("wrong");
        $("#qfb").innerHTML = `<div class="qfb"><b class="${ok ? "vok" : "vbad"}">${ok ? "Correct." : "Not quite."}</b> ${esc(q.why)}</div><div class="row" style="margin-top:10px"><button class="btn ink" type="button" id="qnext">${i + 1 < qz.questions.length ? "Next question" : "See score"}${ico("arrow")}</button></div>`;
        $("#qnext").onclick = () => { i++; show(); }; $("#qnext").focus(); };
    };
    show();
  }

  /* workspace pages (problem/ide): fill the viewport below the top bar (and the launch promo bar, if shown) */
  function fitWorkspace() {
    const w = $(".psplit") || $(".ide"); if (!w) return;
    const f = () => { w.style.height = innerWidth > 960 ? Math.max(520, innerHeight - (w.getBoundingClientRect().top + scrollY)) + "px" : ""; };
    f(); addEventListener("resize", f); setTimeout(f, 300); new MutationObserver(f).observe(document.body, { childList: true });
  }
  if (page === "problem" || page === "ide") fitWorkspace();

  const run = { learn, article, practice, problem, ide, contests, contest, interview }[page];
  if (run) (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", run) : run());
})();
