/* 101 Codecrafts — interactive "Recent activity" cards (live site only; ?static=1 mockup untouched).
   Each .act card gets an action bar: Like (toggle, aria-pressed, count), Comment (opens an inline thread with an
   input) and Share (Web Share API, else copy link). Updates are optimistic: the UI changes first, then the API
   confirms ({ liked, likes } for likes) and the change is rolled back with a toast if it fails.
   - Cards with data-activity-id="<post uuid>" talk to /api/v1/activities/:id/like and /comments (Clerk session).
   - Demo cards (no database id) keep likes and comments in localStorage (cc.activity.v1) so the UI still responds.
   - Guests pressing Like or Comment get an inline sign-in prompt instead of nothing. */
(function () {
  "use strict";
  var html = document.documentElement;
  if (/[?&]static/.test(location.search) || html.classList.contains("static") || location.protocol === "file:") return;
  var API = ((window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api") + "/v1/activities/";
  var KEY = "cc.activity.v1";
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(m) { if (window.CC_UI && window.CC_UI.toast) window.CC_UI.toast(m); }
  function slug(s) { return String(s || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item"; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* private mode: in-memory only */ } }
  function ago(t) { var s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + "m ago" : s < 86400 ? Math.round(s / 3600) + "h ago" : Math.round(s / 86400) + "d ago"; }

  /* ---------- auth: wait (briefly) for js/auth.js to resolve the Clerk session ---------- */
  function whenAuth() {
    return new Promise(function (res) {
      var A = window.CC_AUTH, done = false;
      function fin(u) { if (!done) { done = true; res(u || null); } }
      if (A && A.ready) return fin(A.user);
      if (A && A.onChange) A.onChange(fin);
      setTimeout(function () { fin(window.CC_AUTH && window.CC_AUTH.user); }, 2500);
    });
  }
  function me() { var A = window.CC_AUTH, u = A && A.user; return u ? (u.fullName || u.firstName || "You") : null; }
  async function headers(json) {
    var h = { Accept: "application/json" }; if (json) h["Content-Type"] = "application/json";
    try { var A = window.CC_AUTH, t = A && A.clerk && A.clerk.session && await A.clerk.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e) { /* cookie session */ }
    return h;
  }
  async function call(method, path, body) {
    var r = await fetch(API + path, { method: method, credentials: "include", headers: await headers(!!body), body: body ? JSON.stringify(body) : undefined });
    var j = null; try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) { var err = new Error((j && j.error && j.error.message) || ("HTTP " + r.status)); err.status = r.status; throw err; }
    return j && "data" in j ? j.data : j;
  }

  /* ---------- per-card model ---------- */
  function setup(card, i) {
    if (card.dataset.actReady) return; card.dataset.actReady = "1";
    var who = ($("b", card) || {}).textContent || "Member";
    var id = card.getAttribute("data-activity-id") || "";
    var live = UUID.test(id);
    var key = live ? id : "demo-" + slug(who) + "-" + i;
    if (!card.id) card.id = "activity-" + (live ? id : slug(who));
    var meta = $(".meta", card), nums = meta ? (meta.textContent.match(/\d+/g) || []) : [];
    var seed = { likes: +(nums[0] || 0), comments: +(nums[1] || 0) };
    var st = { liked: false, likes: seed.likes, comments: seed.comments, list: [], loaded: false, busy: false };
    if (!live) {
      var d = load()[key] || {};
      st.liked = !!d.liked; st.likes = seed.likes + (d.liked ? 1 : 0); st.list = d.comments || []; st.comments = seed.comments + st.list.length; st.loaded = true;
    }
    if (meta) meta.hidden = true;
    card.classList.add("act-live");
    var tid = card.id + "-thread";
    var bar = document.createElement("div"); bar.className = "act-bar"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Actions for " + who + "'s post");
    bar.innerHTML =
      '<button type="button" class="act-btn act-like" data-act-like aria-pressed="false"><svg aria-hidden="true" viewBox="0 0 24 24" stroke-width="2.2" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg><span class="sr-only">Like</span><span class="act-n" data-n-likes></span></button>' +
      '<button type="button" class="act-btn act-cmt" data-act-comment aria-expanded="false" aria-controls="' + tid + '"><svg aria-hidden="true"><use href="#i-comment"/></svg><span class="sr-only">Comments</span><span class="act-n" data-n-comments></span></button>' +
      '<button type="button" class="act-btn act-share" data-act-share><svg aria-hidden="true"><use href="#i-share"/></svg><span class="act-lbl">Share</span></button>';
    var gate = document.createElement("div"); gate.className = "act-gate"; gate.hidden = true; gate.setAttribute("role", "status");
    gate.innerHTML = '<span>Sign in to like and comment.</span><a class="act-gate-in" href="auth.html">Sign in</a><a class="act-gate-join" href="auth.html?mode=join">Join free</a>';
    var thr = document.createElement("div"); thr.className = "act-thread"; thr.id = tid; thr.hidden = true;
    thr.innerHTML = '<ol class="act-list" aria-label="Comments" aria-live="polite"></ol>' +
      (live ? "" : '<p class="act-note">Preview: comments you add here are saved on this device only.</p>') +
      '<form class="act-form" novalidate><label class="sr-only" for="' + tid + '-in">Write a comment</label>' +
      '<input id="' + tid + '-in" name="text" type="text" maxlength="2000" autocomplete="off" placeholder="Write a comment…">' +
      '<button type="submit" class="act-send">Post</button></form>';
    card.appendChild(bar); card.appendChild(gate); card.appendChild(thr);
    var likeB = $("[data-act-like]", bar), cmtB = $("[data-act-comment]", bar), shareB = $("[data-act-share]", bar);
    var list = $(".act-list", thr), form = $(".act-form", thr), input = $("input", form);
    var gateTimer = 0;

    function paint() {
      likeB.setAttribute("aria-pressed", st.liked ? "true" : "false");
      $("[data-n-likes]", bar).textContent = st.likes;
      $("[data-n-comments]", bar).textContent = st.comments;
    }
    function persist() {
      if (live) return; var db = load();
      db[key] = { liked: st.liked, comments: st.list.filter(function (c) { return !c.failed; }).map(function (c) { return { id: c.id, who: c.who, text: c.text, t: c.t }; }) };
      save(db);
    }
    function renderList() {
      list.innerHTML = st.list.map(function (c) {
        return '<li class="act-c' + (c.pending ? " is-pending" : "") + (c.failed ? " is-failed" : "") + '" data-cid="' + esc(c.id) + '"><b>' + esc(c.who) + '</b> <span class="act-c-t">' + esc(c.text) + '</span> <small>' +
          (c.failed ? 'Not posted · <button type="button" class="act-retry">Retry</button>' : c.pending ? "Posting…" : esc(ago(c.t))) + "</small></li>";
      }).join("") || '<li class="act-empty">' + (live && !st.loaded ? "Loading comments…" : "No comments yet. Start the conversation.") + "</li>";
    }
    function showGate() {
      gate.hidden = false; clearTimeout(gateTimer); gateTimer = setTimeout(function () { gate.hidden = true; }, 8000);
      var a = $(".act-gate-in", gate); a.href = "auth.html?next=" + encodeURIComponent(location.pathname + "#" + card.id);
    }
    async function guard() { var u = await whenAuth(); if (!u) { showGate(); return false; } gate.hidden = true; return true; }

    likeB.addEventListener("click", async function () {
      if (!(await guard()) || st.busy) return;
      var prev = { liked: st.liked, likes: st.likes };
      st.liked = !st.liked; st.likes = Math.max(0, st.likes + (st.liked ? 1 : -1)); paint();   // optimistic
      if (!live) { persist(); return; }
      st.busy = true;
      try { var r = await call(st.liked ? "POST" : "DELETE", encodeURIComponent(id) + "/like"); if (r && typeof r.likes === "number") { st.liked = !!r.liked; st.likes = r.likes; } }
      catch (e) { st.liked = prev.liked; st.likes = prev.likes; if (e.status === 401) showGate(); else toast(e.status === 403 ? "Likes open once your membership is active." : "Couldn't save your like. Try again."); }
      finally { st.busy = false; paint(); }
    });

    async function openThread(open) {
      thr.hidden = !open; cmtB.setAttribute("aria-expanded", open ? "true" : "false"); card.classList.toggle("is-open", open);
      if (!open) return;
      renderList(); input.focus({ preventScroll: true });
      if (live && !st.loaded) {
        try {
          var rows = await call("GET", encodeURIComponent(id) + "/comments");
          st.list = (rows || []).map(function (c) { return { id: c.id, who: (c.author && c.author.display_name) || "Member", text: c.body, t: Date.parse(c.created_at) || Date.now() }; });
          st.loaded = true; st.comments = Math.max(st.comments, st.list.length); paint();
        } catch (e) { st.loaded = true; if (e.status === 401) showGate(); }
        renderList();
      }
    }
    cmtB.addEventListener("click", async function () {
      if (thr.hidden && !(await guard())) return;
      openThread(thr.hidden);
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); openThread(false); cmtB.focus(); } });

    async function send(c) {
      if (!live) { c.pending = false; persist(); renderList(); return; }
      c.pending = true; c.failed = false; renderList();
      try { var r = await call("POST", encodeURIComponent(id) + "/comments", { text: c.text }); c.id = (r && r.id) || c.id; c.t = Date.parse(r && r.created_at) || c.t; c.pending = false; }
      catch (e) { c.pending = false; c.failed = true; st.comments = Math.max(0, st.comments - 1); paint(); if (e.status === 401) showGate(); else toast(e.status === 403 ? "Comments open once your membership is active." : "Couldn't post your comment. Check your connection and try again."); }
      renderList();
    }
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var text = input.value.trim(); if (!text) { input.focus(); return; }
      if (!(await guard())) return;
      var c = { id: "tmp-" + Date.now(), who: me() || "You", text: text, t: Date.now(), pending: live };
      st.list.push(c); st.comments += 1; input.value = ""; paint();   // optimistic
      send(c);
    });
    list.addEventListener("click", function (e) {
      var b = e.target.closest(".act-retry"); if (!b) return;
      var cid = b.closest("li").getAttribute("data-cid"), c = st.list.find(function (x) { return x.id === cid; });
      if (c) { st.comments += 1; paint(); send(c); }
    });

    shareB.addEventListener("click", async function () {
      var url = location.origin + location.pathname + "#" + card.id;
      var text = (($("q", card) || {}).textContent || "").trim();
      if (window.CC_SHARE) { await window.CC_SHARE.share({ title: who + " on 101 Codecrafts", text: text, url: url }); return; }
      try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch (e) { toast(url); }
    });

    paint();
  }

  function init() { $$("main.app .act").forEach(setup); if (location.hash && /^#activity-/.test(location.hash)) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView({ block: "center" }); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.CC_ACTIVITY = { init: init };
})();
