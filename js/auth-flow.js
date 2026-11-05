/* /auth — ONE route for sign in, sign up and create account (round 11).
   email -> one-time code (Clerk custom flow; Google stays) -> server decides: finished accounts go to their role's home,
   new ones pick a path: Guest (email + code only) · Learner · Tutor, each a multi-step flow with progress, Back/Next,
   validation and save-and-resume (localStorage + PUT /api/v1/auth/onboarding/draft).
   The browser never names a role: POST /api/v1/auth/onboarding takes the path and the server assigns the role
   (101codecrafts@gmail.com -> root_admin, verified server-side). Under 18 -> guardian consent (DPPA 2019 s.8). */
(function () {
  "use strict";
  var root = document.querySelector("[data-af-step]"); if (!root) return;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return [].slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var params = new URLSearchParams(location.search);
  var A = function () { return window.CCAccess; };
  var CONSENT_VERSION = "2026-11-05";
  var DRAFT_KEY = "cc_auth_draft";

  /* ------------------------------------------------------------------ options */
  var LEVELS = [["primary", "Primary school"], ["o_level", "O-Level (S1–S4)"], ["a_level", "A-Level (S5–S6)"], ["university", "University or college"], ["professional", "Working professional"]];
  var GENDERS = [["female", "Female"], ["male", "Male"], ["other", "Other"], ["prefer_not_to_say", "Prefer not to say"]];
  var EXPERIENCE = [["beginner", "New to coding"], ["intermediate", "I've built a few things"], ["advanced", "I code regularly"]];
  var INTERESTS = ["Web development", "Mobile apps", "AI and machine learning", "Data science", "Cybersecurity", "Cloud and DevOps", "UI/UX design", "Game development", "Robotics and IoT", "Competitive programming", "Digital marketing", "Blockchain"];
  var GOALS = ["Get my first tech job", "Pass exams at school", "Build a project or startup", "Switch careers", "Freelance", "Learn for fun"];
  var HEARD = [["friend", "A friend"], ["whatsapp", "WhatsApp"], ["school", "School or university"], ["social", "Social media"], ["event", "An event"], ["search", "Google or search"], ["tutor", "A tutor"], ["other", "Somewhere else"]];
  var SUBJECTS = ["Python", "JavaScript", "HTML and CSS", "Java", "C and C++", "Data science", "AI and machine learning", "Cybersecurity", "Mobile apps", "Cloud", "Mathematics", "ICT (UNEB)"];
  var REL = [["parent", "Parent"], ["guardian", "Guardian"], ["teacher", "Teacher"], ["other", "Other"]];

  /* ------------------------------------------------------------------ state */
  var S = { email: "", mode: "", path: null, step: null, data: {}, session: null, sending: false, resendAt: 0, flow: null };
  var FLOWS = {
    guest: ["consent"],
    learner: ["about", "guardian", "contact", "level", "interests", "goals", "heard", "review"],
    tutor: ["about", "teach", "experience", "credentials", "payout", "heard", "review"]
  };
  function stepsFor(path) { var f = FLOWS[path] || []; return path === "learner" && !isMinor() ? f.filter(function (x) { return x !== "guardian"; }) : f; }
  function age(dob) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || ""); if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], t = new Date(), a = t.getFullYear() - y;
    if (t.getMonth() + 1 < mo || (t.getMonth() + 1 === mo && t.getDate() < d)) a--; return a;
  }
  function isMinor() { var a = age(S.data.dob); return a !== null && a < 18; }

  /* ------------------------------------------------------------------ Clerk + API */
  function clerk() {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function wait() { var c = window.CC_AUTH && window.CC_AUTH.clerk; if (c && c.loaded !== false) return res(c); if (Date.now() - t0 > 9000) return res(null); setTimeout(wait, 80); })();
    });
  }
  async function headers() {
    var h = { Accept: "application/json", "Content-Type": "application/json" };
    try { var c = window.CC_AUTH && window.CC_AUTH.clerk; var tk = c && c.session && await c.session.getToken(); if (tk) h.Authorization = "Bearer " + tk; } catch (e) {}
    return h;
  }
  async function api(method, path, body) {
    var r = await fetch("/api/v1" + path, { method: method, credentials: "include", headers: await headers(), body: body ? JSON.stringify(body) : undefined });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { var err = new Error((j && j.error && j.error.message) || ("Request failed (" + r.status + ")")); err.status = r.status; err.details = j && j.error && j.error.details; throw err; }
    return j && j.data !== undefined ? j.data : j;
  }
  function clerkMsg(e, fallback) {
    var x = e && e.errors && e.errors[0];
    if (!x) return (e && e.message) || fallback;
    var code = x.code || "";
    if (/disposable|blocked/i.test(code + " " + (x.longMessage || ""))) return "Temporary or disposable email addresses aren't allowed. Please use your own email.";
    if (code === "form_code_incorrect") return "That code isn't right. Check the latest email and try again.";
    if (code === "verification_expired") return "That code has expired. Send a new one.";
    if (code === "too_many_requests" || code === "rate_limit_exceeded") return "Too many tries. Wait a minute, then try again.";
    if (code === "form_param_format_invalid") return "Enter a valid email address.";
    if (code === "form_identifier_exists") return "That email already has an account. Sign in instead.";
    if (code === "verification_failed" || code === "form_code_max_attempts") return "Too many wrong codes. Send a new code.";
    return x.longMessage || x.message || fallback;
  }
  function randomPassword() {   // Clerk instance requires a password at sign-up; guests never see or use it (sign-in = email code)
    var a = new Uint8Array(24); crypto.getRandomValues(a);
    return "cc-" + [].map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  /* ------------------------------------------------------------------ drafts (save and resume) */
  function loadDraft() { try { var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); return d && typeof d === "object" ? d : null; } catch (e) { return null; } }
  var saveT = 0;
  function saveDraft() {
    if (!S.path || !S.step) return;
    var keep = Object.assign({}, S.data);
    var d = { email: S.email, path: S.path, step: S.step, data: keep, t: Date.now() };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {}
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (!(window.CC_AUTH && window.CC_AUTH.user)) return;
      var flat = {}; Object.keys(keep).forEach(function (k) { var v = keep[k]; if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") flat[k] = v; else if (Array.isArray(v) && v.every(function (x) { return typeof x === "string"; })) flat[k] = v.slice(0, 20); });
      api("PUT", "/auth/onboarding/draft", { path: S.path, step: S.step, data: flat }).catch(function () {});
    }, 700);
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

  /* ------------------------------------------------------------------ rendering helpers */
  function progress() {
    var p = $("[data-af-progress]"); if (!p) return;
    var list = S.path ? stepsFor(S.path) : [], i = list.indexOf(S.step);
    if (!S.path || i < 0 || list.length < 2) { p.hidden = true; return; }
    p.hidden = false;
    var pct = Math.round(((i + 1) / list.length) * 100);
    $("[data-af-count]").textContent = "Step " + (i + 1) + " of " + list.length;
    $("[data-af-bar]").style.width = pct + "%";
    $(".af-bar").setAttribute("aria-valuenow", String(pct));
  }
  function view(html, focusSel) {
    root.innerHTML = html; progress();
    var f = focusSel ? $(focusSel, root) : $("h1, h2", root);
    if (f) { if (!f.hasAttribute("tabindex") && /^H[12]$/.test(f.tagName)) f.setAttribute("tabindex", "-1"); try { f.focus({ preventScroll: false }); } catch (e) {} }
  }
  var field = function (name, label, input, opts) {
    opts = opts || {};
    return '<label class="af-field">' + esc(label) + (opts.optional ? ' <span class="opt">(optional)</span>' : "") + input +
      (opts.hint ? "<small>" + esc(opts.hint) + "</small>" : "") + '<p class="af-msg" id="m-' + name + '" role="alert"></p></label>';
  };
  var input = function (name, type, attrs) { return '<input name="' + name + '" id="f-' + name + '" type="' + type + '" aria-describedby="m-' + name + '" value="' + esc(S.data[name] == null ? "" : S.data[name]) + '" ' + (attrs || "") + ">"; };
  var select = function (name, options, ph) {
    return '<select name="' + name + '" id="f-' + name + '" aria-describedby="m-' + name + '"><option value="">' + esc(ph || "Choose…") + "</option>" +
      options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (S.data[name] === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
  };
  var chips = function (name, legend, options, multi) {
    var cur = S.data[name]; cur = Array.isArray(cur) ? cur : cur ? [cur] : [];
    return '<fieldset class="af-chips" aria-describedby="m-' + name + '"><legend>' + esc(legend) + "</legend>" + options.map(function (o, i) {
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
      return '<label class="af-chip"><input type="' + (multi ? "checkbox" : "radio") + '" name="' + name + '" value="' + esc(v) + '"' + (cur.indexOf(v) >= 0 ? " checked" : "") + (i === 0 ? ' id="f-' + name + '"' : "") + "><span>" + esc(l) + "</span></label>";
    }).join("") + '</fieldset><p class="af-msg" id="m-' + name + '" role="alert"></p>';
  };
  var actions = function (nextLabel, opts) {
    opts = opts || {};
    return '<div class="af-actions">' + (opts.noBack ? "<span></span>" : '<button type="button" class="af-btn ghost" data-back>Back</button>') +
      '<button type="submit" class="af-btn" data-next>' + esc(nextLabel || "Next") + "</button></div>";
  };
  function setErr(name, msg) {
    var m = $("#m-" + name, root), f = $("#f-" + name, root);
    if (m) m.textContent = msg || "";
    if (f) { if (msg) f.setAttribute("aria-invalid", "true"); else f.removeAttribute("aria-invalid"); }
  }
  function firstErrorFocus() { var f = $("[aria-invalid=true]", root) || $(".af-msg:not(:empty)", root); if (f && f.focus) f.focus(); }
  function busy(btn, on) { if (!btn) return; btn.disabled = !!on; btn.setAttribute("aria-busy", on ? "true" : "false"); }
  function formVals(form) {
    var o = {}; $$("input,select,textarea", form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox" && el.closest(".af-chips")) { (o[el.name] = o[el.name] || []); if (el.checked) o[el.name].push(el.value); }
      else if (el.type === "radio") { if (el.checked) o[el.name] = el.value; else if (!(el.name in o)) o[el.name] = ""; }
      else if (el.type === "checkbox") o[el.name] = el.checked;
      else o[el.name] = el.value.trim();
    }); return o;
  }

  /* ------------------------------------------------------------------ step 1: email */
  function showEmail(msg) {
    S.path = null; S.step = null;
    var join = params.get("mode") === "join";
    view('<h1 class="af-h" id="af-h">' + (join ? "Create your account" : "Sign in or join") + '</h1>' +
      '<p class="af-sub">One place for everything. Enter your email and we\'ll send you a one-time code. New here? You\'ll choose Guest, Learner or Tutor next.</p>' +
      (msg ? '<p class="af-note">' + msg + "</p>" : "") +
      '<div class="af-form"><button type="button" class="af-btn google" data-google><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>Continue with Google</button>' +
      '<p class="af-or">or</p>' +
      '<form class="af-form" data-email novalidate>' + field("email", "Email", input("email", "email", 'autocomplete="email" inputmode="email" required autofocus'), { hint: "No temporary or disposable addresses." }) +
      '<button type="submit" class="af-btn full" data-next>Continue</button></form></div>', "#f-email");
    if (S.email) $("#f-email").value = S.email;
    $("[data-google]").addEventListener("click", google);
    $("[data-email]").addEventListener("submit", onEmail);
  }
  async function google(e) {
    var btn = e.currentTarget; busy(btn, true);
    var c = await clerk(); if (!c) { busy(btn, false); return showEmail("Sign-in is unavailable right now. Check your connection and try again."); }
    var keep = new URL(location.href); keep.search = ""; keep.hash = "";
    var back = location.origin + "/auth.html?sso=1" + (params.get("next") ? "&next=" + encodeURIComponent(params.get("next")) : "");
    try {
      await c.client.signIn.authenticateWithRedirect({ strategy: "oauth_google", redirectUrl: back, redirectUrlComplete: location.origin + "/auth.html?step=route" + (params.get("next") ? "&next=" + encodeURIComponent(params.get("next")) : "") });
    } catch (err) { busy(btn, false); if (sessionExists(err)) return showAddAccount(c, "This site keeps one account signed in at a time. Sign out of the current account first, then continue with Google."); showEmail(esc(clerkMsg(err, "Google sign-in failed. Try again or use your email."))); }
  }
  async function onEmail(e) {
    e.preventDefault();
    var btn = $("[data-next]", e.currentTarget), email = ($("#f-email").value || "").trim().toLowerCase();
    setErr("email", "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 254) { setErr("email", "Enter a valid email address."); return firstErrorFocus(); }
    busy(btn, true); S.email = email;
    try {
      var c = await clerk(); if (!c) throw new Error("Sign-in is unavailable right now. Check your connection and try again.");
      await startCode(c, email);
    } catch (err) {
      busy(btn, false);
      if (sessionExists(err)) { var cc = await clerk(); return showAddAccount(cc, "This site keeps one account signed in at a time. Sign out of the current account first, then sign in with " + esc(email) + "."); }
      setErr("email", clerkMsg(err, err.message || "Something went wrong.")); firstErrorFocus();
    }
  }
  async function startCode(c, email) {
    try {
      var si = await c.client.signIn.create({ identifier: email });
      var f = (si.supportedFirstFactors || []).find(function (x) { return x.strategy === "email_code"; });
      if (!f) throw { errors: [{ code: "no_email_code", longMessage: "Email codes aren't available for this account. Use Continue with Google." }] };
      await si.prepareFirstFactor({ strategy: "email_code", emailAddressId: f.emailAddressId });
      S.mode = "signin"; S.flow = si;
    } catch (err) {
      var code = err && err.errors && err.errors[0] && err.errors[0].code;
      if (code !== "form_identifier_not_found") throw err;
      // NEW account: the same backend temp-mail guard as the Clerk webhook (skipped only if the API is unreachable; Clerk blocks disposable domains too)
      try { var v = await api("POST", "/auth/email-check", { email: email });
        if (v && v.ok === false) throw { errors: [{ code: "email_guard", longMessage: v.reason === "disposable" ? "Temporary or disposable email addresses aren't allowed. Please use your own email." : v.reason === "subaddress" ? "Use your plain email address, without a +tag." : "This email address can't be used. Try another one." }] };
      } catch (x) { if (x && x.errors) throw x; if (x && x.status === 429) throw x; }
      var su;
      try { su = await c.client.signUp.create({ emailAddress: email }); }
      catch (e2) { var c2 = e2 && e2.errors && e2.errors[0]; if (c2 && /password/.test((c2.meta && c2.meta.paramName) || c2.code || "")) su = await c.client.signUp.create({ emailAddress: email, password: randomPassword() }); else throw e2; }
      await su.prepareEmailAddressVerification({ strategy: "email_code" });
      S.mode = "signup"; S.flow = su;
    }
    S.resendAt = Date.now() + 30000;
    showCode();
  }

  /* ------------------------------------------------------------------ step 2: code */
  function showCode(msg, kind) {
    kind = kind || S.mode;
    var title = kind === "totp" ? "Enter your authenticator code" : "Check your email";
    var sub = kind === "totp" ? "Open your authenticator app and type the 6-digit code." : "We sent a 6-digit code to <b>" + esc(S.email) + "</b>. It expires in 10 minutes.";
    view('<h1 class="af-h" id="af-h">' + title + '</h1><p class="af-sub">' + sub + "</p>" + (msg ? '<p class="af-note">' + msg + "</p>" : "") +
      '<form class="af-form" data-code novalidate>' + field("code", "Code", '<input name="code" id="f-code" class="af-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-describedby="m-code">') +
      '<button type="submit" class="af-btn full" data-next>Continue</button>' +
      '<div class="af-actions"><button type="button" class="af-link" data-change>Use a different email</button>' + (kind === "totp" ? "" : '<button type="button" class="af-link" data-resend>Send a new code</button>') + "</div></form>", "#f-code");
    var f = $("[data-code]");
    $("#f-code").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); if (e.target.value.length === 6) f.requestSubmit ? f.requestSubmit() : null; });
    $("[data-change]").addEventListener("click", function () { S.flow = null; showEmail(); });
    var rs = $("[data-resend]"); if (rs) rs.addEventListener("click", resend);
    f.addEventListener("submit", function (e) { e.preventDefault(); verify(kind); });
  }
  async function resend(e) {
    var wait = Math.ceil((S.resendAt - Date.now()) / 1000);
    if (wait > 0) return setErr("code", "You can send a new code in " + wait + " s.");
    busy(e.currentTarget, true);
    try {
      if (S.mode === "signup") await S.flow.prepareEmailAddressVerification({ strategy: "email_code" });
      else { var f = (S.flow.supportedFirstFactors || []).find(function (x) { return x.strategy === "email_code"; }); await S.flow.prepareFirstFactor({ strategy: "email_code", emailAddressId: f && f.emailAddressId }); }
      S.resendAt = Date.now() + 30000; showCode("New code sent.");
    } catch (err) { busy(e.currentTarget, false); setErr("code", clerkMsg(err, "Couldn't send a new code.")); }
  }
  async function verify(kind) {
    var btn = $("[data-next]", root), code = ($("#f-code").value || "").trim();
    setErr("code", "");
    if (!/^\d{6}$/.test(code)) { setErr("code", "Enter the 6-digit code."); return firstErrorFocus(); }
    busy(btn, true);
    try {
      var c = await clerk(), r;
      if (kind === "signup") {
        r = await S.flow.attemptEmailAddressVerification({ code: code });
        if (r.status === "missing_requirements" && (r.missingFields || []).indexOf("password") >= 0) r = await r.update({ password: randomPassword() });
        if (r.status !== "complete") throw { errors: [{ longMessage: "We couldn't finish creating your account (" + esc(r.status) + "). Try again." }] };
      } else if (kind === "totp" || kind === "second") {
        r = await S.flow.attemptSecondFactor({ strategy: kind === "totp" ? "totp" : "email_code", code: code });
      } else {
        r = await S.flow.attemptFirstFactor({ strategy: "email_code", code: code });
        if (r.status === "needs_second_factor" || r.status === "needs_client_trust") {
          S.flow = r;
          var sf = r.supportedSecondFactors || [];
          if (sf.some(function (x) { return x.strategy === "totp"; })) return showCode("", "totp");
          if (sf.some(function (x) { return x.strategy === "email_code"; })) { await r.prepareSecondFactor({ strategy: "email_code" }); S.mode = "second"; return showCode("For your security we sent one more code.", "second"); }
        }
      }
      if (r.status !== "complete") throw { errors: [{ longMessage: "Sign-in isn't complete yet (" + esc(r.status) + ")." }] };
      await c.setActive({ session: r.createdSessionId });
      routeAfterAuth();
    } catch (err) { busy(btn, false); setErr("code", clerkMsg(err, "That didn't work. Try again.")); firstErrorFocus(); }
  }

  /* ------------------------------------------------------------------ after sign-in: the server decides */
  async function loadSession() {
    var s = await api("GET", "/auth/session");
    S.session = s;
    if (A() && A().set) A().set({ role: s.role, roles: s.roles, plan: s.plan, user: s.user, minor: s.minor, consent: s.consent, limits: s.limits, status: s.status, onboarding: s.onboarding });
    return s;
  }
  function allowedNext(role) {
    var n = A() ? A().safeNext(params.get("next") || "") : "";
    if (!n) return "";
    var act = A().pageAction(n);
    return !act || A().can(act, { role: role, plan: (S.session && S.session.plan) || "free", minor: S.session && S.session.minor, consent: S.session ? S.session.consent : true }) ? n : "";
  }
  function land(s) {
    var to = allowedNext(s.role) || (s.redirect && s.redirect.indexOf("/auth") !== 0 ? s.redirect : (A() ? A().home(s.role) : "/index.html"));
    view('<h1 class="af-h" id="af-h">Welcome' + (s.user && s.user.name ? ", " + esc(s.user.name.split(" ")[0]) : "") + '</h1><p class="af-sub">Taking you to ' + (s.role === "guest" ? "your home" : s.role === "admin" || s.role === "root_admin" ? "the admin console" : "your dashboard") + '…</p><p><a class="af-btn" href="' + esc(to) + '">Continue</a></p>');
    location.replace(to);
  }
  async function routeAfterAuth() {
    view('<h1 class="af-h" id="af-h">Signing you in…</h1><p class="af-sub">One moment.</p>');
    var s;
    try { s = await loadSession(); }
    catch (err) {
      if (err.status === 401) return showEmail("Your session ended. Sign in again.");
      return view('<h1 class="af-h" id="af-h">We couldn\'t reach 101</h1><p class="af-err">' + esc(err.message) + '</p><div class="af-actions"><button class="af-btn" data-retry>Try again</button></div>'), $("[data-retry]").addEventListener("click", routeAfterAuth);
    }
    S.email = (s.user && s.user.email) || S.email;
    var staff = s.role === "admin" || s.role === "root_admin";
    /* upgrade=1 | learner | tutor (pricing / upgrade pages send the audience). A guest may become a learner or tutor; a learner
       may apply to teach. Anything else (a learner asking to be a learner) just lands home, never loops back here. */
    var UP = params.get("upgrade"), want = UP === "learner" || UP === "tutor" ? UP : null;
    var upgrade = (s.role === "guest" && (UP === "1" || !!want)) || (s.role === "learner" && want === "tutor");
    if (staff || (s.onboarding && s.onboarding.completed && !upgrade)) {
      if (s.onboarding && s.onboarding.step === "guardian_pending") return showGuardianPending(s);
      clearDraft(); return land(s);
    }
    // resume a draft for this account (local first, then the server copy)
    var d = loadDraft();
    if (d && d.email && d.email !== S.email) d = null;
    if (!d && s.onboarding && s.onboarding.draft && s.onboarding.draft.path) d = { path: s.onboarding.draft.path, step: s.onboarding.draft.step, data: s.onboarding.draft.data || {} };
    if (d && FLOWS[d.path] && !(upgrade && d.path === "guest") && (!want || d.path === want)) { S.data = d.data || {}; return go(d.path, stepsFor(d.path).indexOf(d.step) >= 0 ? d.step : stepsFor(d.path)[0], true); }
    if (upgrade && want && FLOWS[want]) return go(want, stepsFor(want)[0], true);
    showPath(upgrade);
  }

  function isUpgrade() { var u = params.get("upgrade"); return u === "1" || u === "learner" || u === "tutor"; }
  /* ------------------------------------------------------------------ path choice */
  function showPath(upgrade) {
    S.path = null; S.step = null; progress();
    var card = function (p, icon, title, text, tag) {
      var cur = upgrade && p === "guest";
      return '<button type="button" class="af-path" data-path="' + p + '"' + (cur ? ' aria-current="true" disabled' : "") + '><svg aria-hidden="true"><use href="#i-' + icon + '"/></svg><span><b>' + title + "</b><small>" + text + "</small>" + (cur ? "<em>You're a guest now</em>" : tag ? "<em>" + tag + "</em>" : "") + "</span></button>";
    };
    view('<h1 class="af-h" id="af-h">' + (upgrade ? "Become a learner or tutor" : "How will you use 101?") + '</h1><p class="af-sub">' + (upgrade ? "Unlock your own dashboard, tutor courses, 1:1 sessions and selling on the marketplace." : "Pick one. You can upgrade from Guest later.") + "</p>" +
      '<div class="af-paths">' +
      card("guest", "user", "Guest", "Just your email. Browse, read the news, take free and external courses, buy on the marketplace.", "Fastest") +
      card("learner", "cap", "Learner", "Your learner dashboard, tutor and premium courses, 1:1 sessions, projects, sell your work. Free plan available.", "7–8 quick steps") +
      card("tutor", "teacher", "Tutor", "Teach courses, take on learners, run sessions and get paid by Mobile Money. 18+ only; an admin verifies you.", "7 steps") +
      '</div><div class="af-actions"><button type="button" class="af-link" data-signout>Not ' + esc(S.email || "you") + "? Sign out</button></div>");
    $$("[data-path]").forEach(function (b) { b.addEventListener("click", function () { if (b.disabled) return; var p = b.dataset.path; S.data = S.path === p ? S.data : (S.data.name ? { name: S.data.name, dob: S.data.dob } : {}); go(p, stepsFor(p)[0]); }); });
    $("[data-signout]").addEventListener("click", async function () { clearDraft(); try { var c = await clerk(); if (c) await c.signOut(); } catch (e) {} location.replace("/auth.html"); });
  }

  /* ------------------------------------------------------------------ multi-step engine */
  function go(path, step, replace) {
    S.path = path; S.step = step; saveDraft();
    try { history[replace ? "replaceState" : "pushState"]({ af: 1, path: path, step: step }, "", "#" + path + "/" + step); } catch (e) {}
    render();
  }
  window.addEventListener("popstate", function (e) {
    var st = e.state;
    if (st && st.af && FLOWS[st.path] && stepsFor(st.path).indexOf(st.step) >= 0) { S.path = st.path; S.step = st.step; render(); }
    else if (S.session) showPath(isUpgrade());
  });
  function back() {
    var list = stepsFor(S.path), i = list.indexOf(S.step);
    if (i > 0) go(S.path, list[i - 1]); else showPath(isUpgrade());
  }
  function next() {
    var list = stepsFor(S.path), i = list.indexOf(S.step);
    if (i < list.length - 1) go(S.path, list[i + 1]); else submit();
  }
  var STEP = {};
  function render() {
    var def = STEP[S.path + "." + S.step] || STEP[S.step];
    if (!def) return showPath();
    view('<h1 class="af-h" id="af-h">' + esc(def.title()) + "</h1>" + (def.why ? '<p class="af-sub">' + def.why() + "</p>" : "") +
      '<form class="af-form" data-stepform novalidate>' + def.body() + actions(def.next ? def.next() : "Next") + "</form>");
    var form = $("[data-stepform]");
    $("[data-back]", form).addEventListener("click", back);
    if (def.wire) def.wire(form);
    form.addEventListener("change", function () { Object.assign(S.data, formVals(form)); saveDraft(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var vals = formVals(form); $$(".af-msg", form).forEach(function (m) { m.textContent = ""; }); $$("[aria-invalid]", form).forEach(function (x) { x.removeAttribute("aria-invalid"); });
      var errs = def.validate ? def.validate(vals) : {};
      Object.assign(S.data, vals); saveDraft();
      var keys = Object.keys(errs);
      if (keys.length) { keys.forEach(function (k) { setErr(k, errs[k]); }); return firstErrorFocus(); }
      next();
    });
  }
  var req = function (v, msg, errs, k) { if (v == null || v === "" || (Array.isArray(v) && !v.length)) errs[k] = msg; };
  var PHONE = /^\+?[0-9]{9,15}$/;
  var today = function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); };

  /* guest */
  STEP["guest.consent"] = {
    title: function () { return "Join as a guest"; },
    why: function () { return "That's all we need: your verified email <b>" + esc(S.email) + "</b>. You can become a learner or tutor whenever you like."; },
    body: function () { return '<p class="af-note">Guests can browse, read the news, take free and external courses and buy on the marketplace. Selling, projects, tutor courses, 1:1 sessions and ratings need a learner or tutor account.</p>' + consentBox(); },
    validate: function (v) { var e = {}; if (!v.terms) e.terms = "Please accept the Terms and Privacy Policy."; return e; },
    next: function () { return "Finish"; }
  };
  function consentBox() {
    return '<label class="af-check"><input type="checkbox" name="terms" id="f-terms" aria-describedby="m-terms"' + (S.data.terms ? " checked" : "") + '><span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>, including storing my data with 101 Codecrafts\' providers outside Uganda (Germany, France and the United States), in line with Uganda\'s Data Protection and Privacy Act (Cap. 97).</span></label><p class="af-msg" id="m-terms" role="alert"></p>';
  }

  /* learner + tutor: about you (DOB drives the age gate) */
  var about = {
    title: function () { return "About you"; },
    why: function () { return "Your name shows on your profile. We ask your date of birth to keep under-18s safe: they join with a parent or guardian's approval."; },
    body: function () {
      return field("name", "Full name", input("name", "text", 'autocomplete="name" maxlength="80" required')) +
        field("dob", "Date of birth", input("dob", "date", 'autocomplete="bday" required max="' + today() + '" min="1920-01-01"')) +
        field("gender", "Gender", select("gender", GENDERS, "Choose…"), { hint: "Helps us report fairly on who we reach. \"Prefer not to say\" is fine." });
    },
    validate: function (v) {
      var e = {}; req(v.name, "Enter your name.", e, "name"); if (v.name && v.name.length < 2) e.name = "Enter your full name.";
      var a = age(v.dob);
      if (!v.dob) e.dob = "Enter your date of birth."; else if (a === null || a < 5 || a > 100) e.dob = "Enter a real date of birth.";
      else if (S.path === "tutor" && a < 18) e.dob = "Tutors must be 18 or older. Go Back to join as a learner instead.";
      req(v.gender, "Choose an option (\"Prefer not to say\" is fine).", e, "gender");
      return e;
    }
  };
  STEP["learner.about"] = about; STEP["tutor.about"] = about;

  STEP["learner.guardian"] = {
    title: function () { return "A parent or guardian approves"; },
    why: function () { return "You're under 18, so Uganda's Data Protection and Privacy Act (s.8) needs a parent or guardian's consent before we keep your details. We'll email them a link. Until they approve, your account stays limited: you can read and take free courses, but not buy, post, message, rate or book sessions."; },
    body: function () {
      return field("guardian_name", "Their full name", input("guardian_name", "text", 'maxlength="120" required autocomplete="off"')) +
        field("guardian_email", "Their email", input("guardian_email", "email", 'maxlength="254" required inputmode="email" autocomplete="off"'), { hint: "Must be different from your own email." }) +
        field("guardian_relationship", "They are your…", select("guardian_relationship", REL));
    },
    validate: function (v) {
      var e = {}; req(v.guardian_name, "Enter their name.", e, "guardian_name");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.guardian_email || "")) e.guardian_email = "Enter a valid email.";
      else if ((v.guardian_email || "").toLowerCase() === (S.email || "").toLowerCase()) e.guardian_email = "Use your parent or guardian's own email, not yours.";
      req(v.guardian_relationship, "Choose one.", e, "guardian_relationship"); return e;
    }
  };
  STEP["learner.contact"] = {
    title: function () { return "Mobile Money number"; },
    why: function () { return "Used only to pay for courses and sessions by MTN or Airtel Mobile Money. You can add it later."; },
    body: function () { return field("phone", "Phone", input("phone", "tel", 'autocomplete="tel" inputmode="tel" placeholder="+2567XXXXXXXX"'), { optional: true }); },
    validate: function (v) { var e = {}; if (v.phone && !PHONE.test(v.phone.replace(/[\s-]/g, ""))) e.phone = "Digits only, e.g. +256 7XX XXX XXX."; return e; }
  };
  STEP["learner.level"] = {
    title: function () { return "Your level"; },
    why: function () { return "So your dashboard starts at the right place."; },
    body: function () { return field("level", "Education level", select("level", LEVELS)) + chips("experience", "Coding experience (optional)", EXPERIENCE, false); },
    validate: function (v) { var e = {}; req(v.level, "Choose your education level.", e, "level"); return e; }
  };
  STEP["learner.interests"] = {
    title: function () { return "What do you want to learn?"; },
    why: function () { return "Pick up to 12. We use these to suggest courses and projects."; },
    body: function () { return chips("interests", "Interests", INTERESTS, true); },
    validate: function (v) { var e = {}; req(v.interests, "Pick at least one.", e, "interests"); if ((v.interests || []).length > 12) e.interests = "Pick 12 or fewer."; return e; }
  };
  STEP["learner.goals"] = {
    title: function () { return "Your goals"; },
    why: function () { return "Pick up to 6. Your plan and reminders follow these."; },
    body: function () { return chips("goals", "Goals", GOALS, true) + field("goal_note", "Anything else?", '<textarea name="goal_note" id="f-goal_note" maxlength="500" aria-describedby="m-goal_note">' + esc(S.data.goal_note || "") + "</textarea>", { optional: true }); },
    validate: function (v) { var e = {}; req(v.goals, "Pick at least one goal.", e, "goals"); if ((v.goals || []).length > 6) e.goals = "Pick 6 or fewer."; return e; }
  };
  var heard = {
    title: function () { return "How did you hear about 101?"; },
    body: function () { return chips("heard_from", "Pick one", HEARD, false); },
    validate: function (v) { var e = {}; req(v.heard_from, "Pick one.", e, "heard_from"); return e; }
  };
  STEP["learner.heard"] = heard; STEP["tutor.heard"] = heard;

  /* tutor */
  STEP["tutor.teach"] = {
    title: function () { return "What you teach"; },
    why: function () { return "Learners find you by level and subject."; },
    body: function () {
      var extra = (S.data.subjects || []).filter(function (x) { return SUBJECTS.indexOf(x) < 0; });
      return chips("levels", "Levels you teach", LEVELS, true) + chips("subjects", "Subjects", SUBJECTS.concat(extra), true) +
        field("subject_add", "Add another subject", '<input id="f-subject_add" name="subject_add" type="text" maxlength="40" aria-describedby="m-subject_add">', { optional: true, hint: "Press Enter to add it." });
    },
    wire: function (form) {
      var a = $("#f-subject_add", form);
      a.addEventListener("keydown", function (e) { if (e.key !== "Enter") return; e.preventDefault(); var v = a.value.trim().slice(0, 40); if (!v) return;
        Object.assign(S.data, formVals(form)); S.data.subjects = (S.data.subjects || []).concat([v]).filter(function (x, i, arr) { return arr.indexOf(x) === i; }).slice(0, 15); S.data.subject_add = ""; render(); $("#f-subject_add").focus(); });
    },
    validate: function (v) { var e = {}; req(v.levels, "Pick at least one level.", e, "levels"); req(v.subjects, "Pick at least one subject.", e, "subjects"); if ((v.subjects || []).length > 15) e.subjects = "15 at most."; return e; }
  };
  STEP["tutor.experience"] = {
    title: function () { return "Experience and bio"; },
    why: function () { return "Shown on your tutor profile once an admin verifies you."; },
    body: function () {
      return field("years_experience", "Years teaching or working in tech", input("years_experience", "number", 'min="0" max="60" step="1" inputmode="numeric" required')) +
        field("bio", "Short bio", '<textarea name="bio" id="f-bio" minlength="50" maxlength="2000" required aria-describedby="m-bio">' + esc(S.data.bio || "") + "</textarea>", { hint: "50–2000 characters: who you teach, how, and what learners get." }) +
        field("phone", "Contact phone", input("phone", "tel", 'autocomplete="tel" inputmode="tel" placeholder="+2567XXXXXXXX" required'));
    },
    validate: function (v) {
      var e = {}, y = Number(v.years_experience);
      if (v.years_experience === "" || !Number.isInteger(y) || y < 0 || y > 60) e.years_experience = "Enter whole years from 0 to 60.";
      if ((v.bio || "").length < 50) e.bio = "Write at least 50 characters (" + (v.bio || "").length + " so far).";
      if (!PHONE.test((v.phone || "").replace(/[\s-]/g, ""))) e.phone = "Digits only, e.g. +256 7XX XXX XXX.";
      return e;
    }
  };
  STEP["tutor.credentials"] = {
    title: function () { return "Credentials"; },
    why: function () { return "Degrees, certificates or a portfolio. Links must start with https://. An admin reviews them before your courses go live."; },
    body: function () {
      var list = Array.isArray(S.data.credentials) && S.data.credentials.length ? S.data.credentials : [{ title: "", url: "" }];
      return list.map(function (c, i) {
        return '<div class="af-cred">' + field("cred_title_" + i, "Title", '<input id="f-cred_title_' + i + '" name="cred_title_' + i + '" maxlength="120" value="' + esc(c.title) + '" aria-describedby="m-cred_title_' + i + '">') +
          field("cred_url_" + i, "Link", '<input id="f-cred_url_' + i + '" name="cred_url_' + i + '" type="url" inputmode="url" placeholder="https://" value="' + esc(c.url || "") + '" aria-describedby="m-cred_url_' + i + '">', { optional: true }) +
          (i ? '<button type="button" class="af-link" data-rm="' + i + '">Remove</button>' : "<span></span>") + "</div>";
      }).join("") + (list.length < 8 ? '<button type="button" class="af-link" data-add>+ Add another</button>' : "") +
        field("linkedin_url", "LinkedIn", input("linkedin_url", "url", 'placeholder="https://www.linkedin.com/in/…" inputmode="url"'), { optional: true });
    },
    wire: function (form) {
      var collect = function () { var v = formVals(form), out = []; for (var i = 0; i < 8; i++) if (("cred_title_" + i) in v) out.push({ title: v["cred_title_" + i], url: v["cred_url_" + i] }); S.data.credentials = out; S.data.linkedin_url = v.linkedin_url; };
      var add = $("[data-add]", form); if (add) add.addEventListener("click", function () { collect(); S.data.credentials.push({ title: "", url: "" }); render(); });
      $$("[data-rm]", form).forEach(function (b) { b.addEventListener("click", function () { collect(); S.data.credentials.splice(+b.dataset.rm, 1); render(); }); });
      form.addEventListener("submit", collect, true);
    },
    validate: function (v) {
      var e = {}, n = 0;
      for (var i = 0; i < 8; i++) { if (!(("cred_title_" + i) in v)) continue; var t = v["cred_title_" + i], u = v["cred_url_" + i];
        if (t) n++; if (u && !/^https:\/\/[^\s]+\.[^\s]+/.test(u)) e["cred_url_" + i] = "Links must start with https://"; if (u && !t) e["cred_title_" + i] = "Add a title for this link."; }
      if (!n) e.cred_title_0 = "Add at least one credential.";
      if (v.linkedin_url && !/^https:\/\/[^\s]+/.test(v.linkedin_url)) e.linkedin_url = "Must start with https://";
      return e;
    }
  };
  STEP["tutor.payout"] = {
    title: function () { return "Payouts"; },
    why: function () { return "Where we send your earnings by Mobile Money. Stored encrypted; only the last 4 digits are ever shown. No money moves until you're verified."; },
    body: function () { return chips("payout_network", "Network", [["MTN", "MTN MoMo"], ["AIRTEL", "Airtel Money"]], false) + field("payout_phone", "Mobile Money number", input("payout_phone", "tel", 'inputmode="tel" placeholder="07XX XXX XXX" required autocomplete="off"')); },
    validate: function (v) { var e = {}; req(v.payout_network, "Choose MTN or Airtel.", e, "payout_network"); if (!PHONE.test((v.payout_phone || "").replace(/[\s-]/g, ""))) e.payout_phone = "Enter the Mobile Money number, digits only."; return e; }
  };

  /* review + consent (both paths) */
  function label(list, v) { var f = list.find(function (x) { return x[0] === v; }); return f ? f[1] : v || "—"; }
  var review = {
    title: function () { return "Check and finish"; },
    why: function () { return S.path === "tutor" ? "After you finish, an admin reviews your application. Your tutor dashboard opens right away in \"pending verification\" mode." : isMinor() ? "We'll email your parent or guardian next." : "You can change all of this later in Settings."; },
    body: function () {
      var d = S.data, rows = [["Email", S.email], ["Name", d.name], ["Date of birth", d.dob], ["Gender", label(GENDERS, d.gender)]];
      if (S.path === "learner") rows = rows.concat(isMinor() ? [["Guardian", (d.guardian_name || "") + " · " + (d.guardian_email || "")]] : []).concat([["Phone", d.phone || "—"], ["Level", label(LEVELS, d.level)], ["Interests", (d.interests || []).join(", ")], ["Goals", (d.goals || []).join(", ")]]);
      else rows = rows.concat([["Levels", (d.levels || []).map(function (l) { return label(LEVELS, l); }).join(", ")], ["Subjects", (d.subjects || []).join(", ")], ["Experience", (d.years_experience || 0) + " years"], ["Credentials", (d.credentials || []).filter(function (c) { return c.title; }).map(function (c) { return c.title; }).join(", ")], ["Payout", (d.payout_network || "") + " ··" + String(d.payout_phone || "").replace(/\D/g, "").slice(-4)]]);
      rows.push(["Heard about us", label(HEARD, d.heard_from)]);
      return '<dl class="af-review">' + rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1] || "—") + "</dd>"; }).join("") + "</dl>" + consentBox() + '<p class="af-msg" id="m-form" role="alert"></p>';
    },
    validate: function (v) { var e = {}; if (!v.terms) e.terms = "Please accept the Terms and Privacy Policy."; return e; },
    next: function () { return S.path === "tutor" ? "Submit application" : "Create account"; }
  };
  STEP["learner.review"] = review; STEP["tutor.review"] = review;

  /* ------------------------------------------------------------------ submit (server assigns the role) */
  function payload() {
    var d = S.data, consent = { terms: true, version: CONSENT_VERSION }, clean = function (p) { return p ? String(p).replace(/[\s-]/g, "") : undefined; };
    if (S.path === "guest") return { path: "guest", consent: consent };
    if (S.path === "learner") {
      var b = { path: "learner", name: d.name, dob: d.dob, gender: d.gender, level: d.level, interests: d.interests || [], goals: d.goals || [], heard_from: d.heard_from, consent: consent };
      if (d.phone) b.phone = clean(d.phone); if (d.experience) b.experience = d.experience; if (d.goal_note) b.goal_note = d.goal_note;
      if (isMinor()) b.guardian = { name: d.guardian_name, email: d.guardian_email, relationship: d.guardian_relationship };
      return b;
    }
    var t = { path: "tutor", name: d.name, dob: d.dob, gender: d.gender, phone: clean(d.phone), levels: d.levels || [], subjects: d.subjects || [], years_experience: Number(d.years_experience),
      bio: d.bio, payout_phone: clean(d.payout_phone), payout_network: d.payout_network, heard_from: d.heard_from, consent: consent,
      credentials: (d.credentials || []).filter(function (c) { return c.title; }).map(function (c) { return c.url ? { title: c.title, url: c.url } : { title: c.title }; }) };
    if (d.linkedin_url) t.linkedin_url = d.linkedin_url;
    return t;
  }
  async function submit() {
    var btn = $("[data-next]", root); busy(btn, true);
    try {
      var r = await api("POST", "/auth/onboarding", payload());
      clearDraft();
      var s = await loadSession().catch(function () { return null; });
      if (r && r.guardian === "pending") return showGuardianPending(s || { role: r.role, user: { email: S.email } });
      land(s || { role: r.role, redirect: r.redirect, user: {} });
    } catch (err) {
      busy(btn, false);
      var m = $("#m-form", root) || $("#m-terms", root);
      if (m) m.textContent = err.message || "Couldn't finish. Try again.";
      if (err.status === 401) showEmail("Your session ended. Sign in again; your answers are saved.");
    }
  }
  function showGuardianPending(s) {
    S.path = null; S.step = null; progress();
    var to = A() ? A().home((s && s.role) || "learner") : "/dashboard.html";
    view('<h1 class="af-h" id="af-h">Almost there</h1><p class="af-sub">We emailed your parent or guardian a link to approve your account. It works for 7 days.</p>' +
      '<p class="af-note warn">Until they approve, your account is limited: you can read the news and take free courses, but not buy, post, message, rate or book sessions.</p>' +
      '<div class="af-actions"><a class="af-btn ghost" href="/settings-apps.html#guardian">Change guardian</a><a class="af-btn" href="' + esc(to) + '">Continue</a></div>');
  }

  /* ------------------------------------------------------------------ add another account (?add=1, from the account menu)
     A signed-in member is NOT bounced home here. Clerk multi-session instances add the new session next to the current one;
     single-session instances (Clerk's default) refuse with session_exists, so we offer "sign out of X and continue". */
  var ADD = params.get("add") === "1";
  function currentEmail(c) { return (c && c.user && c.user.primaryEmailAddress && c.user.primaryEmailAddress.emailAddress) || "your current account"; }
  function homeHref() { var role = (A() && A().role) || "learner"; return A() && A().home ? A().home(role) : "/dashboard.html"; }
  function showAddAccount(c, note) {
    S.path = null; S.step = null; S.email = ""; progress();
    var who = esc(currentEmail(c));
    view('<h1 class="af-h" id="af-h">Add another account</h1>' +
      '<p class="af-sub">You\'re signed in as <b>' + who + '</b>. Use a different email or Google account to add or switch to another 101 account.</p>' +
      (note ? '<p class="af-note warn" role="alert">' + note + "</p>" : "") +
      '<div class="af-actions af-stack"><button type="button" class="af-btn" data-add-email>Use another email</button>' +
      '<button type="button" class="af-btn ghost" data-add-switch>Sign out of ' + who + ' and continue</button>' +
      '<a class="af-btn ghost" href="' + esc(homeHref()) + '" data-add-back>Back to my account</a></div>', "[data-add-email]");
    $("[data-add-email]").addEventListener("click", function () { showEmail("Adding another account. You stay signed in as " + who + " unless you switch."); });
    $("[data-add-switch]").addEventListener("click", async function (e) {
      busy(e.currentTarget, true);
      try { await c.signOut(); } catch (x) { /* already signed out */ }
      try { if (window.CCAccess && CCAccess.set) CCAccess.set({ role: "visitor", user: null }); } catch (x) {}
      showEmail("Signed out of " + who + ". Sign in with the other account.");
    });
  }
  function sessionExists(err) { var x = err && err.errors && err.errors[0]; return !!x && (x.code === "session_exists" || /already signed in|session.*exist/i.test(x.longMessage || x.message || "")); }

  /* ------------------------------------------------------------------ boot */
  async function boot() {
    var g = params.get("guardian");
    var note = g === "approved" ? "Thank you. Consent recorded and the account is now active. The learner can sign in." : g === "invalid" ? "That approval link has expired or was already used. Ask the learner to send a new one from Settings." : "";
    var c = await clerk();
    if (params.get("sso") === "1" && c) {
      try {
        await c.handleRedirectCallback({ signInFallbackRedirectUrl: location.origin + "/auth.html?step=route", signUpFallbackRedirectUrl: location.origin + "/auth.html?step=route",
          continueSignUpUrl: location.origin + "/auth.html?step=route", firstFactorUrl: location.origin + "/auth.html", signInUrl: location.origin + "/auth.html", signUpUrl: location.origin + "/auth.html" });
      } catch (e) { return showEmail(esc(clerkMsg(e, "Google sign-in didn't finish. Try again."))); }
    }
    if (c && c.user && ADD && params.get("sso") !== "1") return showAddAccount(c);
    if (c && c.user) { S.email = (c.user.primaryEmailAddress && c.user.primaryEmailAddress.emailAddress) || ""; return routeAfterAuth(); }
    if (!c) return showEmail("Sign-in couldn't load. Check your connection, then reload the page." + (note ? "<br>" + note : ""));
    showEmail(note);
  }
  boot();
})();
