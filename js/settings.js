/* 101 Codecrafts: settings.html (round 11). Talks to the real backend (/api/v1/me*) with the Clerk session token, and to
   Clerk itself for avatar, password, 2FA, passkeys, sessions and connected accounts. Device-only settings (motion, theme,
   Lite, language, region) live in localStorage and work signed out. Never shows invented data: empty sections say so. */
(function () {
  "use strict";
  if (/[?&]static/.test(location.search)) return;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var html = document.documentElement;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var ls = { get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  function say(el, t, bad) { if (!el) return; el.textContent = ""; el.classList.toggle("bad", !!bad); setTimeout(function () { el.textContent = t; }, 30); }
  var fmtDate = function (d) { try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: ls.get("cc_tz", "Africa/Kampala") }); } catch (e) { return String(d).slice(0, 10); } };
  var ugx = function (n) { return "UGX " + Number(n || 0).toLocaleString("en-UG"); };

  /* ------------------------------------------------------------ API */
  async function headers(json) {
    var h = { Accept: "application/json" }; if (json) h["Content-Type"] = "application/json";
    var c = window.CC_AUTH && window.CC_AUTH.clerk;
    try { var t = c && c.session && await c.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e) {}
    return h;
  }
  async function api(method, path, body) {
    var r = await fetch("/api/v1" + path, { method: method, credentials: "include", headers: await headers(!!body), body: body ? JSON.stringify(body) : undefined });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { var err = new Error((j && j.error && (j.error.message || j.error.code)) || ("HTTP " + r.status)); err.status = r.status; err.code = j && j.error && j.error.code; throw err; }
    return j && j.data !== undefined ? j.data : j;
  }
  var OFFLINE = "Couldn't reach 101 right now. Check your connection and try again.";
  function errText(e) { return e && e.status ? (e.status === 401 ? "Your session ended. Sign in again." : e.status === 403 ? (e.message || "You can't do that on this account.") : e.status === 429 ? "Too many tries. Wait a minute and try again." : e.message) : OFFLINE; }

  /* ------------------------------------------------------------ device-only settings (work signed out) */
  function localSettings() {
    // background motion
    var m = window.CC_BG ? CC_BG.mode() : ls.get("cc_bg_motion", "on");
    $$('input[name=bgm]').forEach(function (r) { r.checked = r.value === m; r.onchange = function () { if (window.CC_BG) CC_BG.set(r.value); else ls.set("cc_bg_motion", r.value);
      var s = document.getElementById("cc-bgm"); if (s) s.value = r.value; say($("#st-a11y-msg"), "Background animation: " + r.parentElement.textContent.trim() + "."); }; });
    // theme
    var t = ls.get("theme", "system"); if (t !== "dark" && t !== "light") t = "system";
    $$('input[name=theme]').forEach(function (r) { r.checked = r.value === t; r.onchange = function () { if (window.CC_THEME) CC_THEME.set(r.value); say($("#st-a11y-msg"), "Theme: " + r.value + "."); }; });
    // lite
    var lite = $("#st-lite"); lite.checked = html.classList.contains("lite");
    lite.onchange = function () { html.classList.toggle("lite", lite.checked); ls.set("lite", lite.checked ? "1" : "0"); var b = document.getElementById("cc-lite"); if (b) b.setAttribute("aria-pressed", lite.checked);
      say($("#st-a11y-msg"), lite.checked ? "Lite mode on." : "Lite mode off. Reloading to bring images back…"); if (!lite.checked) setTimeout(function () { location.reload(); }, 900); };
    // generic local checkboxes / selects
    $$("[data-local]").forEach(function (el) {
      var k = el.dataset.local, v = ls.get(k, null);
      if (el.type === "checkbox") { if (v != null) el.checked = v === "1"; if (el.dataset.class) html.classList.toggle(el.dataset.class, el.checked);
        el.addEventListener("change", function () { ls.set(k, el.checked ? "1" : "0"); if (el.dataset.class) html.classList.toggle(el.dataset.class, el.checked); }); }
      else { if (v != null) el.value = v; el.addEventListener("change", function () { ls.set(k, el.value); }); }
    });
    // language: drive the shared View settings select so i18n runs in one place (js/ui.js)
    var sl = $("#st-lang"); sl.value = ls.get("lang", "en");
    sl.onchange = function () { var g = document.getElementById("cc-lang"); if (g) { g.value = sl.value; g.dispatchEvent(new Event("change")); } else { ls.set("lang", sl.value); location.reload(); } };
  }

  /* ------------------------------------------------------------ account sections */
  var ME = null, USER = null;
  var EVENTS = [["messages", "Messages"], ["comments", "Comments and replies"], ["courses", "Courses and lessons"], ["events", "Events and sessions"], ["payments", "Payments and payouts"], ["announcements", "Announcements"], ["gamification", "Badges, streaks and points"]];

  function fillProfile() {
    var f = $("#st-profile"), p = (ME && ME.profile) || {};
    ["display_name", "username", "headline", "bio", "location", "education_level", "institution", "class_year", "github_username", "linkedin_url", "website_url"].forEach(function (k) { if (f[k]) f[k].value = p[k] || (k === "display_name" && USER ? (USER.fullName || "") : ""); });
    skills = Array.isArray(p.skills) ? p.skills.slice() : []; drawSkills();
    avatar();
    $$("[data-st-viewprofile]").forEach(function (a) { a.href = p.username ? "/u/" + encodeURIComponent(p.username) : "profile.html"; });
  }
  function avatar() {
    var el = $("#st-av"), img = USER && USER.hasImage && USER.imageUrl, n = (USER && (USER.fullName || USER.firstName)) || "?";
    el.innerHTML = img ? '<img src="' + esc(img) + '" alt="" width="96" height="96" referrerpolicy="no-referrer">' : esc(n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("") || "?");
    $("#st-av-rm").hidden = !img;
  }
  var skills = [];
  function drawSkills() {
    $("#st-skills").innerHTML = skills.length ? skills.map(function (s, i) { return '<span role="listitem" class="st-chip">' + esc(s) + '<button type="button" data-rm="' + i + '" aria-label="Remove ' + esc(s) + '">×</button></span>'; }).join("")
      : '<span class="st-empty" role="listitem">No skills yet. Add the ones you use, e.g. Python, Excel, Figma.</span>';
  }
  function wireProfile() {
    var f = $("#st-profile"), msg = $(".st-msg", f), inp = $("#st-skill-in");
    inp.addEventListener("keydown", function (e) { if (e.key !== "Enter" && e.key !== ",") return; e.preventDefault(); var v = inp.value.trim().replace(/,$/, ""); if (v && skills.length < 30 && skills.indexOf(v) < 0) { skills.push(v.slice(0, 40)); drawSkills(); } inp.value = ""; });
    $("#st-skills").addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (!b) return; skills.splice(+b.dataset.rm, 1); drawSkills(); inp.focus(); });
    f.addEventListener("submit", async function (e) {
      e.preventDefault(); if (!f.display_name.value.trim()) { say(msg, "Add a display name.", true); f.display_name.focus(); return; }
      if (f.username.value && !/^[a-z0-9_]{3,30}$/.test(f.username.value)) { say(msg, "Username: 3–30 lowercase letters, numbers or _.", true); f.username.focus(); return; }
      var b = {}, opt = function (k) { var v = f[k].value.trim(); b[k] = v || null; };
      b.display_name = f.display_name.value.trim(); if (f.username.value) b.username = f.username.value;
      ["headline", "bio", "location", "institution", "class_year", "github_username", "linkedin_url", "website_url"].forEach(opt);
      if (b.linkedin_url && !/^https:\/\//.test(b.linkedin_url)) { say(msg, "The LinkedIn link must start with https://", true); return; }
      if (f.education_level.value) b.education_level = f.education_level.value; b.skills = skills;
      var btn = $("button[type=submit]", f); btn.disabled = true; say(msg, "Saving…");
      try { await api("PATCH", "/me", b); if (ME) ME.profile = Object.assign(ME.profile || {}, b); say(msg, "Profile saved.");
        try { var parts = b.display_name.split(/\s+/); if (USER && USER.update) await USER.update({ firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined }); } catch (x) {}
      } catch (x) { say(msg, x.status === 409 ? "That username is taken. Try another." : errText(x), true); }
      btn.disabled = false;
    });
    $("#st-av-file").addEventListener("change", async function (e) {
      var file = e.target.files && e.target.files[0]; e.target.value = ""; if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return say(msg, "Choose a PNG, JPG or WebP image.", true);
      if (file.size > 5 * 1048576) return say(msg, "That photo is over 5 MB. Choose a smaller one.", true);
      say(msg, "Uploading photo…");
      try { await USER.setProfileImage({ file: file }); await USER.reload(); avatar(); say(msg, "Photo updated."); if (window.CC_SHELL) CC_SHELL.account({ user: USER, name: USER.fullName || USER.firstName || "Member", email: (USER.primaryEmailAddress || {}).emailAddress, image: USER.imageUrl, initials: "" }); }
      catch (x) { say(msg, "Couldn't upload the photo. Try again.", true); }
    });
    $("#st-av-rm").addEventListener("click", async function () { try { await USER.setProfileImage({ file: null }); await USER.reload(); avatar(); say(msg, "Photo removed."); } catch (x) { say(msg, "Couldn't remove the photo.", true); } });
  }

  function fillAccount() {
    var u = USER || {}, me = ME || {};
    var set = function (k, v) { $$('[data-st="' + k + '"]').forEach(function (e) { e.innerHTML = v; }); };
    set("email", esc((u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || "—"));
    var ph = u.primaryPhoneNumber && u.primaryPhoneNumber.phoneNumber; if (ph) set("phone", esc(ph));
    var A = window.CCAccess || {}; set("role", esc({ guest: "Guest", learner: "Learner", tutor: "Tutor", admin: "Admin", root_admin: "Root admin" }[A.role] || "Member"));
    if (u.createdAt) set("since", esc(fmtDate(u.createdAt)));
    var plan = { free: "Free", standard: "Standard", plus: "Plus", pro: "Pro" }[A.plan || "free"] || "Free";
    set("plan", esc(plan + " plan")); if (me.pro_until) set("plan-until", "Renews or ends " + esc(fmtDate(me.pro_until)));
    var staff = A.role === "admin" || A.role === "root_admin"; $$("[data-st-upgrade]").forEach(function (a) { a.hidden = staff; });
    set("mfa", u.twoFactorEnabled ? "<b class=st-ok>On.</b> Your account asks for a second step when you sign in." : "Off. Add an authenticator app so a stolen password isn't enough.");
    set("pw", u.passwordEnabled ? "A password is set. Change it any time." : "You sign in without a password (Google or email code). You can add one.");
    $$('#security [data-clerk-profile]').forEach(function (b, i) { if (i === 1) b.textContent = u.twoFactorEnabled ? "Manage" : "Set up"; if (i === 0) b.textContent = u.passwordEnabled ? "Change password" : "Add a password"; });
    methods(u);
    // connected accounts
    var ex = u.externalAccounts || [];
    $("#st-conn").innerHTML = ex.length ? ex.map(function (a) { var p = String(a.provider || a.verification && a.verification.strategy || "").replace(/^oauth_/, ""); return '<li><b>' + esc(p.charAt(0).toUpperCase() + p.slice(1)) + '</b><small>' + esc(a.emailAddress || a.username || "") + '</small></li>'; }).join("")
      : '<li class="st-empty">No connected accounts yet. Connect Google or GitHub for one-tap sign in.</li>';
  }

  /* r12 design (BUS F3): a security row whose sign-in method is switched OFF in the Clerk instance would open the
     profile panel on the password page (the only one left), so it looked broken. When Clerk's environment says the
     method is off, the row says so plainly and the button is removed; when the environment isn't known, nothing changes. */
  function methodOn(k) {
    var c = window.CC_AUTH && window.CC_AUTH.clerk, env = c && (c.__unstable__environment || c.environment);
    var at = env && env.userSettings && env.userSettings.attributes; if (!at) return null;
    var a = at[k]; if (!a) return false; return a.enabled !== false;
  }
  function methods(u) {
    var OFF = { password: "Not used on 101. You sign in with Google or a one-time code sent to your email.",
      authenticator_app: "Not available on 101 yet. Each sign-in already needs a one-time code sent to your email.",
      passkey: "Not available on 101 yet." };
    $$("#security [data-st-method]").forEach(function (row) {
      var k = row.dataset.stMethod, on = methodOn(k), b = $("[data-clerk-profile]", row), small = $("small", row);
      if (k === "authenticator_app" && u && u.twoFactorEnabled) on = true;   /* already enrolled: keep Manage */
      if (k === "password" && u && u.passwordEnabled) on = true;
      if (on === false) { if (b) b.hidden = true; if (small) small.textContent = OFF[k]; row.classList.add("st-off"); }
      else { if (b) b.hidden = false; row.classList.remove("st-off"); }
    });
  }

  async function sessions() {
    var ul = $("#st-sessions"), msg = $("#st-sess-msg");
    try {
      var list = await USER.getSessions(), cur = window.CC_AUTH.clerk.session && window.CC_AUTH.clerk.session.id;
      if (!list.length) { ul.innerHTML = '<li class="st-empty">No other active sessions.</li>'; return; }
      ul.innerHTML = list.map(function (s) {
        var a = s.latestActivity || {}, dev = [a.browserName, a.browserVersion && a.browserVersion.split(".")[0]].filter(Boolean).join(" ") || "Browser";
        var where = [a.city, a.country].filter(Boolean).join(", "), kind = a.isMobile ? "Phone" : "Computer";
        return '<li data-sid="' + esc(s.id) + '"><div><b>' + esc(kind + " · " + dev) + (s.id === cur ? ' <i class="st-tag">This device</i>' : "") + '</b><small>' + esc([a.deviceType, where, a.ipAddress].filter(Boolean).join(" · ")) + (s.lastActiveAt ? " · last active " + esc(fmtDate(s.lastActiveAt)) : "") + '</small></div>' +
          (s.id === cur ? "" : '<button type="button" class="btn sm" data-revoke>Sign out</button>') + "</li>";
      }).join("");
      ul.onclick = async function (e) { var b = e.target.closest("[data-revoke]"); if (!b) return; var li = b.closest("li"), s = list.find(function (x) { return x.id === li.dataset.sid; });
        b.disabled = true; try { await s.revoke(); li.remove(); say(msg, "Signed out that device."); } catch (x) { b.disabled = false; say(msg, "Couldn't sign out that device. Try again.", true); } };
    } catch (e) { ul.innerHTML = '<li class="st-empty">Sessions are shown once your sign-in loads. Use "Manage" above to see them in the secure panel.</li>'; }
  }

  async function notifications() {
    var f = $("#st-notif"), msg = $(".st-msg", f), tb = $("#st-notif-rows"), pref = {};
    try { pref = (await api("GET", "/me/notification-preferences")) || {}; } catch (e) { say(msg, errText(e), true); }
    var on = function (ch, k) { return !(pref[ch] && pref[ch][k] === false); };
    tb.innerHTML = EVENTS.map(function (ev) { return "<tr><th scope=row>" + esc(ev[1]) + "</th>" + ["in_app", "email"].map(function (ch) {
      return '<td><label class="st-tog"><input type="checkbox" data-ch="' + ch + '" data-ev="' + ev[0] + '"' + (on(ch, ev[0]) ? " checked" : "") + '><span class="sr-only">' + esc(ev[1]) + (ch === "email" ? " by email" : " in the app") + "</span></label></td>"; }).join("") + "</tr>"; }).join("");
    f.digest_frequency.value = pref.digest_frequency || "weekly"; f.whatsapp_number.value = pref.whatsapp_number || ""; f.whatsapp_opt_in.checked = !!pref.whatsapp_opt_in;
    f.onsubmit = async function (e) {
      e.preventDefault(); var b = { in_app: {}, email: {}, digest_frequency: f.digest_frequency.value, whatsapp_opt_in: f.whatsapp_opt_in.checked, whatsapp_number: f.whatsapp_number.value.trim() || null };
      if (b.whatsapp_number && !/^\+[0-9]{7,15}$/.test(b.whatsapp_number)) return say(msg, "WhatsApp number: use the +256… format.", true);
      if (b.whatsapp_opt_in && !b.whatsapp_number) return say(msg, "Add your WhatsApp number first.", true);
      $$("input[data-ch]", tb).forEach(function (c) { b[c.dataset.ch][c.dataset.ev] = c.checked; });
      say(msg, "Saving…"); try { await api("PUT", "/me/notification-preferences", b); say(msg, "Notifications saved."); } catch (x) { say(msg, errText(x), true); }
    };
  }

  function privacy() {
    var f = $("#st-privacy"), msg = $(".st-msg", f), p = (ME && ME.profile) || {};
    f.is_public.checked = !!p.is_public; f.email_opt_in.checked = !!p.email_opt_in;
    f.onsubmit = async function (e) { e.preventDefault(); say(msg, "Saving…");
      try { await api("PATCH", "/me", { is_public: f.is_public.checked, email_opt_in: f.email_opt_in.checked }); say(msg, "Privacy saved."); } catch (x) { say(msg, errText(x), true); } };
  }

  async function payments() {
    var box = $("#st-payments");
    try { var rows = await api("GET", "/me/payments?limit=20"); rows = Array.isArray(rows) ? rows : (rows && rows.items) || [];
      if (!rows.length) return;
      box.innerHTML = '<div class="st-tablewrap"><table class="st-table"><thead><tr><th scope=col>Date</th><th scope=col>For</th><th scope=col>Amount</th><th scope=col>Status</th></tr></thead><tbody>' +
        rows.map(function (r) { return "<tr><td>" + esc(fmtDate(r.created_at)) + "</td><td>" + esc(String(r.purpose || "").replace(/_/g, " ")) + "</td><td>" + esc(ugx(r.amount_ugx)) + "</td><td>" + esc(r.status) + (r.refunded_ugx ? " · refunded " + esc(ugx(r.refunded_ugx)) : "") + "</td></tr>"; }).join("") + "</tbody></table></div>";
    } catch (e) { /* keep the empty state; the API may be offline */ }
  }

  function exportData() {
    var msg = $("#st-export-msg");
    $("#st-export").onclick = async function () { var b = this; b.disabled = true; say(msg, "Preparing your data…");
      try { var r = await fetch("/api/v1/me/export", { credentials: "include", headers: await headers() }); if (!r.ok) { var e = new Error("x"); e.status = r.status; throw e; }
        var blob = await r.blob(); (window.CC_SHARE ? CC_SHARE.download : dl)(blob, "101codecrafts-my-data-" + new Date().toISOString().slice(0, 10) + ".json"); say(msg, "Downloaded. Keep the file somewhere safe: it has your personal data.");
      } catch (x) { say(msg, errText(x), true); } b.disabled = false; };
    $("#st-export-local").onclick = function () { var o = {}; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^(cc|theme|lite|lang|cookies)/.test(k)) o[k] = localStorage.getItem(k); } } catch (e) {}
      (window.CC_SHARE ? CC_SHARE.download : dl)(new Blob([JSON.stringify(o, null, 2)], { type: "application/json" }), "101codecrafts-device-settings.json"); say(msg, "Downloaded this device's settings."); };
  }
  function dl(blob, name) { var u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }

  function guardian() {
    var f = $("#st-guardian"), msg = $(".st-msg", f), me = ME || {}, ob = me.onboarding || {};
    if (ob.guardian_status || me.guardian_status) $('[data-st="guardian"]').innerHTML = "Status: <b>" + esc(String(ob.guardian_status || me.guardian_status).replace(/_/g, " ")) + "</b>";
    f.onsubmit = async function (e) {
      e.preventDefault(); var dob = f.date_of_birth.value, b = { date_of_birth: dob, guardian_name: f.guardian_name.value.trim(), relationship: f.relationship.value };
      if (f.guardian_email.value.trim()) b.guardian_email = f.guardian_email.value.trim(); if (f.guardian_phone.value.trim()) b.guardian_phone = f.guardian_phone.value.trim();
      if (!dob) return say(msg, "Add your date of birth.", true);
      var age = (Date.now() - new Date(dob).getTime()) / 31557600000; if (age >= 18) return say(msg, "You're 18 or over, so you don't need a guardian.", false);
      if (b.guardian_name.length < 2) return say(msg, "Add your guardian's full name.", true);
      if (!b.guardian_email && !b.guardian_phone) return say(msg, "Add your guardian's email or phone.", true);
      say(msg, "Sending…"); try { var r = await api("POST", "/me/guardian", b); say(msg, r && r.channel === "email" ? "Sent. We emailed your guardian a secure link (valid 7 days)." : "Saved. A 101 admin will call your guardian to confirm."); $('[data-st="guardian"]').innerHTML = "Status: <b>waiting for your guardian</b>"; }
      catch (x) { say(msg, errText(x), true); }
    };
  }

  /* delete: typed confirmation -> POST /me/delete. The server requires a sign-in within the last 10 minutes (Clerk
     reverification) and refuses the root admin. 24 h cool-off with Cancel (DELETE /me/delete). */
  function deletion() {
    var f = $("#st-delete"), msg = $(".st-msg", f), btn = $("button[type=submit]", f), st = $("#st-del-status"), A = window.CCAccess || {};
    if (A.role === "root_admin") { f.hidden = true; st.innerHTML = '<p class="st-note">This is the root admin account. It can\'t be deleted from here; it keeps the admin console running.</p>'; return; }
    f.confirm.addEventListener("input", function () { btn.disabled = f.confirm.value.trim() !== "DELETE MY ACCOUNT"; });
    var show = function (r) { if (!r || !r.id || r.status === "cancelled" || r.status === "completed" || r.status === "rejected") { st.innerHTML = ""; f.hidden = false; return; }
      f.hidden = true; var when = r.erase_after || r.due_at;
      st.innerHTML = '<div class="st-note"><b>Deletion scheduled.</b> Your account will be erased after ' + esc(when ? fmtDate(when) : "the 24-hour cool-off") + '. Changed your mind?<div class="row"><button type="button" class="btn" data-del-cancel>Cancel deletion</button></div></div>';
      $("[data-del-cancel]", st).onclick = async function () { try { await api("DELETE", "/me/delete"); show(null); say(msg, "Deletion cancelled. Your account stays."); } catch (x) { say(msg, errText(x), true); } }; };
    api("GET", "/me/delete").then(show).catch(function () {});
    f.onsubmit = async function (e) {
      e.preventDefault(); if (f.confirm.value.trim() !== "DELETE MY ACCOUNT") return;
      btn.disabled = true; say(msg, "Sending your request…");
      try { var r = await api("POST", "/me/delete", { confirm: "DELETE MY ACCOUNT", details: f.details.value.trim() || undefined }); show(r); say(msg, "Request received."); }
      catch (x) {
        if (x.status === 403 && /reverif/i.test(x.code || x.message || "")) {
          st.innerHTML = '<div class="st-note"><b>Confirm it\'s you.</b> For your safety, deleting an account needs a fresh sign-in (within the last 10 minutes).<div class="row"><button type="button" class="btn or" data-reauth>Sign in again</button></div></div>';
          $("[data-reauth]", st).onclick = async function () { try { await window.CC_AUTH.clerk.signOut(); } catch (z) {} location.href = "auth.html?next=" + encodeURIComponent("/settings.html#delete"); };
          say(msg, "");
        } else say(msg, errText(x), true);
        btn.disabled = false;
      }
    };
  }

  function clerkPanel() {
    $$("[data-clerk-profile]").forEach(function (b) { b.addEventListener("click", function () { var c = window.CC_AUTH && window.CC_AUTH.clerk;
      if (c && c.openUserProfile) c.openUserProfile({ appearance: { variables: { colorPrimary: "#fc8c0c", colorText: "#0B1236", borderRadius: "0px" } }, customPages: [], __experimental_startPath: b.dataset.clerkProfile === "security" ? "/security" : undefined });
      else location.href = "auth.html?next=" + encodeURIComponent("/settings.html"); }); });
  }

  /* ------------------------------------------------------------ boot */
  function visitor(on) {
    $$("[data-st-visitor]").forEach(function (e) { e.hidden = !on; });
    $$("[data-st-acct]").forEach(function (e) { e.hidden = on; });
  }
  async function signedIn(u) {
    USER = u; visitor(false);
    try { ME = await api("GET", "/me"); } catch (e) { ME = null; }
    fillProfile(); fillAccount(); privacy(); guardian(); deletion(); sessions(); notifications(); payments();
  }
  function init() {
    localSettings(); wireProfile(); exportData(); clerkPanel();
    if (!window.CC_AUTH) { visitor(true); return; }
    var first = true;
    window.CC_AUTH.onChange(function (u) { if (!u) { visitor(true); USER = ME = null; return; } if (first || !USER || USER.id !== u.id) { first = false; signedIn(u); } });
    if (window.CCAccess) (CCAccess.onChange || CCAccess.on).call(CCAccess, function () { if (USER) fillAccount(); });
    // deep link: open the right section on load (sticky nav keeps the hash in sync while scrolling)
    var nav = $(".st-nav"), links = $$("a", nav), secs = links.map(function (a) { return document.getElementById(a.hash.slice(1)); });
    if ("IntersectionObserver" in window) { var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (!en.isIntersecting) return; links.forEach(function (a) { a.toggleAttribute("aria-current", a.hash === "#" + en.target.id); }); }); }, { rootMargin: "-30% 0px -60% 0px" });
      secs.forEach(function (s) { if (s) io.observe(s); }); }
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
