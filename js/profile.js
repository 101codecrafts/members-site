/* 101 Codecrafts: profile.html (round 11).
   /u/<username> or ?u=<username>  -> public profile (GET /api/v1/portfolio/<username>: active, public, adult profiles only)
   no handle, signed in            -> YOUR profile, with Public view / Private view (GET /api/v1/me, /me/certificates)
   no handle, signed out           -> a sign-in prompt. Never a placeholder person.
   Empty sections show faint example placeholders and an "Add" link to settings.html.
   Share: image (canvas card, Web Share API Level 2 with a PNG download fallback), PDF (client-side, branded, chosen
   sections, JPEG pages wrapped in a hand-written PDF: no library, nothing uploaded), and the public link. */
(function () {
  "use strict";
  if (/[?&]static/.test(location.search)) return;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var ico = function (n) { return '<svg aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var EDU = { primary: "Primary", o_level: "O-Level", a_level: "A-Level", university: "University / college", professional: "Professional" };
  var ROLE = { guest: "Guest", learner: "Learner", tutor: "Tutor", admin: "Admin", root_admin: "Root admin" };
  var root = $("#pf"); if (!root) return;
  var handle = ((location.pathname.match(/\/u\/([^/?#]+)/) || [])[1] || new URLSearchParams(location.search).get("u") || "").toLowerCase();
  var SITE = location.origin;
  var D = null;   /* the profile being shown: { own, profile, badges, certificates, projects, role, image } */
  var view = "public";

  async function headers() { var h = { Accept: "application/json" }, c = window.CC_AUTH && window.CC_AUTH.clerk; try { var t = c && c.session && await c.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e) {} return h; }
  async function get(path) { var r = await fetch("/api/v1" + path, { credentials: "include", headers: await headers() }); if (!r.ok) { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; } var j = await r.json(); return j && j.data !== undefined ? j.data : j; }
  var initials = function (n) { return (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("") || "?"; };
  var fmt = function (d) { try { return new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Africa/Kampala" }); } catch (e) { return ""; } };

  /* ------------------------------------------------------------ render */
  function placeholder(list) { return list.map(function (t) { return '<span class="pf-ph-chip" aria-hidden="true">' + esc(t) + "</span>"; }).join(""); }
  function render() {
    var p = D.profile || {}, own = D.own, priv = own && view === "private";
    var name = p.display_name || (own ? "Your name" : "Member"), named = !!p.display_name;
    var tags = [(ROLE[D.role] ? '<span class="pf-tag on">' + esc(ROLE[D.role]) + "</span>" : ""), p.education_level ? '<span class="pf-tag">' + esc(EDU[p.education_level] || p.education_level) + "</span>" : "", p.location ? '<span class="pf-tag">' + esc(p.location) + "</span>" : "",
      p.joined_at ? '<span class="pf-tag">Joined ' + esc(fmt(p.joined_at)) + "</span>" : ""].join("");
    var edit = function (anchor, label) { return own ? '<a class="st-link" href="settings.html#' + anchor + '">' + esc(label || "Edit") + "</a>" : ""; };
    var skills = (p.skills || []).length ? '<div class="st-chips">' + p.skills.map(function (s) { return '<span class="st-chip" style="padding-right:10px">' + esc(s) + "</span>"; }).join("") + "</div>"
      : own ? '<p class="pf-ph">No skills yet.</p>' + placeholder(["Python", "Excel", "Figma", "Networking"]) : '<p class="st-empty">No skills listed.</p>';
    var links = [];
    if (p.github_username) links.push('<li><a href="https://github.com/' + esc(p.github_username) + '" target="_blank" rel="noopener noreferrer">' + ico("gh") + "github.com/" + esc(p.github_username) + "</a></li>");
    if (p.linkedin_url) links.push('<li><a href="' + esc(p.linkedin_url) + '" target="_blank" rel="noopener noreferrer">' + ico("in") + esc(p.linkedin_url.replace(/^https?:\/\/(www\.)?/, "")) + "</a></li>");
    if (p.website_url && /^https?:\/\//.test(p.website_url)) links.push('<li><a href="' + esc(p.website_url) + '" target="_blank" rel="noopener noreferrer">' + ico("link") + esc(p.website_url.replace(/^https?:\/\//, "")) + "</a></li>");
    var linksH = links.length ? '<ul class="pf-links">' + links.join("") + "</ul>" : own ? '<p class="pf-ph">github.com/your-name · linkedin.com/in/your-name · your-site.dev</p>' : '<p class="st-empty">No links.</p>';
    var showBadges = !(own && localStorage.getItem("cc_pv_badges") === "0" && view === "public");
    var badges = (D.badges || []).length ? '<div class="pf-badges">' + D.badges.map(function (b) { var x = b.badges || b; return '<div class="pf-badge"><b>' + esc(x.name || x.code) + "</b><small>" + esc(b.awarded_at ? "Earned " + fmt(b.awarded_at) : "") + "</small></div>"; }).join("") + "</div>"
      : '<p class="' + (own ? "pf-ph" : "st-empty") + '">No badges yet.' + (own ? " Finish lessons, keep a streak or ship a project to earn your first one." : "") + "</p>";
    var certs = (D.certificates || []).length ? '<ul class="pf-links">' + D.certificates.map(function (c) { return '<li><a href="verify.html?code=' + encodeURIComponent(c.verify_code) + '">' + ico("badge") + esc(c.title) + " · " + esc(fmt(c.issued_at)) + "</a></li>"; }).join("") + "</ul>"
      : '<p class="' + (own ? "pf-ph" : "st-empty") + '">No certificates yet.' + (own ? " Complete a 101 course to get a verifiable certificate." : "") + "</p>";
    var privacy = own ? '<div class="pf-view" role="group" aria-label="Preview"><button type="button" data-view="public" aria-pressed="' + (view === "public") + '">Public view</button><button type="button" data-view="private" aria-pressed="' + (view === "private") + '">Private view</button></div>' +
      (view === "public" ? '<p class="pf-private-note">' + (p.is_public ? "This is what anyone with your link sees." : "Your profile is <b>private</b>: only you and 101 admins can see it. Turn on Public profile in <a href=\"settings.html#privacy\">Privacy</a> to share the link.") + "</p>"
        : '<p class="pf-private-note">Only you see this view: your email, phone and account details are never public.</p>') : "";
    var u = D.user || {};
    var privateCard = priv ? '<section class="card"><div class="sec-title"><h2>PRIVATE DETAILS</h2>' + edit("account", "Manage") + '</div><dl class="st-dl"><div><dt>Email</dt><dd>' + esc((u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || "—") + "</dd></div><div><dt>Phone</dt><dd>" + esc((u.primaryPhoneNumber && u.primaryPhoneNumber.phoneNumber) || "Not added") + "</dd></div><div><dt>Plan</dt><dd>" + esc(((window.CCAccess && CCAccess.plan) || "free").replace(/^./, function (c) { return c.toUpperCase(); })) + ' plan</dd></div><div><dt>Profile visibility</dt><dd>' + (p.is_public ? "Public" : "Private") + "</dd></div></dl></section>" : "";
    root.innerHTML = privacy +
      '<section class="card pf-hero"><span class="pf-av" aria-hidden="true">' + (D.image ? '<img src="' + esc(D.image) + '" alt="" width="120" height="120" referrerpolicy="no-referrer">' : esc(initials(named ? name : ""))) + "</span>" +
      '<div>' + (p.username ? '<div class="pf-handle">@' + esc(p.username) + "</div>" : own ? '<div class="pf-handle pf-ph">@choose-a-username</div>' : "") +
      '<h1 class="pf-name' + (named ? "" : " pf-ph") + '">' + esc(name) + "</h1>" +
      (p.headline ? '<p class="pf-head">' + esc(p.headline) + "</p>" : own ? '<p class="pf-head pf-ph">e.g. Python learner · building a school fees app</p>' : "") +
      '<div class="pf-meta">' + tags + "</div></div>" +
      '<div class="pf-actions"><button type="button" class="btn or" data-share-open>' + ico("share") + "Share profile</button>" + (own ? '<a class="btn" href="settings.html#profile">' + ico("pen") + "Edit profile</a>" : "") + '<a class="btn ghost" href="card.html">' + ico("badge") + "Member card</a></div></section>" +
      '<div class="pf-grid">' +
      '<section class="card"><div class="sec-title"><h2>ABOUT</h2>' + edit("profile") + "</div>" + (p.bio ? '<p style="white-space:pre-line">' + esc(p.bio) + "</p>" : own ? '<p class="pf-ph">A few lines about you: what you\'re learning, what you\'ve built, what you want to do next.</p>' : '<p class="st-empty">No bio yet.</p>') +
        (p.institution || p.class_year ? '<p><b>Education:</b> ' + esc([p.institution, p.class_year].filter(Boolean).join(" · ")) + "</p>" : "") + "</section>" +
      '<section class="card"><div class="sec-title"><h2>SKILLS</h2>' + edit("profile", "Add") + "</div>" + skills + "</section>" +
      '<section class="card"><div class="sec-title"><h2>LINKS</h2>' + edit("profile", "Add") + "</div>" + linksH + "</section>" +
      (showBadges ? '<section class="card"><div class="sec-title"><h2>BADGES</h2></div>' + badges + "</section>" : "") +
      (showBadges ? '<section class="card"><div class="sec-title"><h2>CERTIFICATES</h2></div>' + certs + "</section>" : "") +
      privateCard + "</div>";
    $$("[data-view]", root).forEach(function (b) { b.onclick = function () { view = b.dataset.view; render(); $('[data-view="' + view + '"]', root).focus(); }; });
    $("[data-share-open]", root).onclick = openShare;
    document.title = (named ? name + " · " : "") + "101 Codecrafts";
  }
  function message(h, body, actions) { root.innerHTML = '<section class="card st-signin"><h1 class="st-h">' + esc(h) + "</h1><p>" + body + '</p><div class="row">' + (actions || "") + "</div></section>"; }

  /* ------------------------------------------------------------ load */
  async function loadPublic() {
    try { var r = await get("/portfolio/" + encodeURIComponent(handle)); D = { own: false, profile: r.profile, badges: r.badges, certificates: r.certificates, projects: r.projects, role: r.tutor ? "tutor" : "learner", image: r.profile && r.profile.avatar_url };
      var me = window.CC_AUTH && window.CC_AUTH.user, mine = window.CCAccess && CCAccess.me && CCAccess.me.profile && CCAccess.me.profile.username === handle;
      if (me && mine) return loadOwn(me); render(); }
    catch (e) { message(e.status === 404 ? "Profile not found" : "Couldn't load this profile", e.status === 404 ? "This profile doesn't exist, or its owner keeps it private." : "Check your connection and try again.", '<a class="btn or" href="community.html">Find members</a>'); }
  }
  async function loadOwn(u) {
    var me = null, certs = [], badges = [];
    try { me = await get("/me"); } catch (e) {}
    try { certs = await get("/me/certificates"); } catch (e) {}
    var p = (me && me.profile) || { display_name: u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ") };
    if (p.username && p.is_public) { try { var pub = await get("/portfolio/" + encodeURIComponent(p.username)); badges = pub.badges || []; } catch (e) {} }
    D = { own: true, user: u, profile: p, badges: badges, certificates: Array.isArray(certs) ? certs : [], role: (window.CCAccess && CCAccess.role) || "learner", image: u.hasImage ? u.imageUrl : p.avatar_url };
    view = "private"; render();
  }
  function boot() {
    if (handle) return loadPublic();
    if (!window.CC_AUTH) return message("Sign in to see your profile", "Your profile shows your skills, education, links, badges and certificates.", '<a class="btn or" href="auth.html?next=%2Fprofile.html">Sign in</a><a class="btn" href="auth.html?mode=join">Join 101 free</a>');
    window.CC_AUTH.onChange(function (u) { if (u) loadOwn(u); else message("Sign in to see your profile", "Your profile shows your skills, education, links, badges and certificates. Looking for someone? Open their /u/username link.", '<a class="btn or" href="auth.html?next=%2Fprofile.html">Sign in</a><a class="btn" href="auth.html?mode=join&return=%2Fprofile.html">Join 101 free</a>'); });
  }

  /* ------------------------------------------------------------ share: image card (card.html look, flat brutalist) */
  var NAVY = "#0B1236", NAVY2 = "#111A45", NAVY3 = "#1A2560", OR = "#fc8c0c", CY = "#05e6f2", WHITE = "#ffffff", MUT = "#B9C1DA";
  var F = { disp: '"CC Display","Archivo Black",Impact,sans-serif', sans: '"CC Sans","CC Sans Fallback",Arial,sans-serif', mono: '"CC Mono","CC Mono Fallback","DejaVu Sans Mono",monospace' };
  var imgCache = {};
  function loadImg(src) { if (!src) return Promise.resolve(null); if (imgCache[src]) return imgCache[src];
    return (imgCache[src] = new Promise(function (res) { var i = new Image(); i.crossOrigin = "anonymous"; i.referrerPolicy = "no-referrer"; i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; })); }
  function wrap(ctx, text, maxW, maxLines) { var words = String(text || "").split(/\s+/), lines = [], cur = ""; words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…"; } return lines; }
  function block(ctx, x, y, w, h, fill, shadow, stroke) { ctx.fillStyle = shadow || NAVY3; ctx.fillRect(x + 12, y + 12, w, h); ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.lineWidth = 6; ctx.strokeStyle = stroke || WHITE; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6); }
  async function drawCard(cv) {
    var ctx = cv.getContext("2d"), W = cv.width, H = cv.height, p = D.profile || {};
    try { await document.fonts.ready; } catch (e) {}
    ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(238,241,248,.08)"; ctx.lineWidth = 2;   /* the site grid, flat */
    for (var gx = 0; gx <= W; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy <= H; gy += 60) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    var logo = await loadImg("/assets/img/logo-101-header@3x.webp");
    if (logo) ctx.drawImage(logo, 72, 64, 164, 82);
    ctx.fillStyle = WHITE; ctx.font = "400 44px " + F.disp; ctx.textBaseline = "alphabetic"; ctx.fillText("CODECRAFTS", 256, 124);
    ctx.fillStyle = OR; ctx.fillRect(W - 72 - 250, 74, 250, 60); ctx.fillStyle = NAVY; ctx.font = "700 26px " + F.mono; ctx.textAlign = "center"; ctx.fillText("MEMBER", W - 72 - 125, 114); ctx.textAlign = "left";
    /* avatar block */
    var ax = 72, ay = 210, as = 300; block(ctx, ax, ay, as, as, OR, CY);
    var av = await loadImg(D.image);
    if (av) { var s = Math.min(av.width, av.height); ctx.drawImage(av, (av.width - s) / 2, (av.height - s) / 2, s, s, ax + 6, ay + 6, as - 12, as - 12); }
    else { ctx.fillStyle = NAVY; ctx.font = "400 120px " + F.disp; ctx.textAlign = "center"; ctx.fillText(initials(p.display_name), ax + as / 2, ay + as / 2 + 44); ctx.textAlign = "left"; }
    /* name + handle */
    var tx = 420, tw = W - tx - 72; ctx.fillStyle = WHITE; var size = 76; ctx.font = "400 " + size + "px " + F.disp;
    var nm = String(p.display_name || "101 Member").toUpperCase(); while (size > 44 && wrap(ctx, nm, tw).length > 2) { size -= 4; ctx.font = "400 " + size + "px " + F.disp; }
    var nl = wrap(ctx, nm, tw, 3); nl.forEach(function (l, i) { ctx.fillText(l, tx, 270 + i * (size + 6)); });
    var y = 270 + nl.length * (size + 6) + 8;
    if (p.username) { ctx.fillStyle = CY; ctx.font = "700 30px " + F.mono; ctx.fillText("@" + p.username, tx, y); y += 46; }
    var role = ROLE[D.role] || "Learner", edu = EDU[p.education_level] || ""; ctx.font = "700 24px " + F.mono;
    [role, edu].filter(Boolean).forEach(function (t, i) { var w = ctx.measureText(t.toUpperCase()).width + 32; ctx.fillStyle = i ? NAVY2 : CY; ctx.fillRect(tx, y, w, 46); ctx.strokeStyle = WHITE; ctx.lineWidth = 3; ctx.strokeRect(tx + 1.5, y + 1.5, w - 3, 43); ctx.fillStyle = i ? WHITE : NAVY; ctx.fillText(t.toUpperCase(), tx + 16, y + 32); tx += w + 12; });
    /* headline */
    y = 580; ctx.fillStyle = WHITE; ctx.font = "600 40px " + F.sans;
    var hl = wrap(ctx, p.headline || "Learning, building and growing in tech with 101 Codecrafts.", W - 144, 3); hl.forEach(function (l, i) { ctx.fillText(l, 72, y + i * 54); });
    /* skills: right under the headline, so short profiles don't leave a hole */
    y = Math.max(y + hl.length * 54 + 70, 720); ctx.fillStyle = OR; ctx.font = "700 26px " + F.mono; ctx.fillText("SKILLS", 72, y); y += 26;
    var sx = 72, sy = y; ctx.font = "700 30px " + F.sans;
    (p.skills && p.skills.length ? p.skills : ["Add skills on 101"]).slice(0, 10).forEach(function (sk) { var w = ctx.measureText(sk).width + 40; if (sx + w > W - 72) { sx = 72; sy += 76; } if (sy > 1080) return;
      ctx.fillStyle = NAVY3; ctx.fillRect(sx + 6, sy + 6, w, 60); ctx.fillStyle = NAVY2; ctx.fillRect(sx, sy, w, 60); ctx.strokeStyle = MUT; ctx.lineWidth = 3; ctx.strokeRect(sx + 1.5, sy + 1.5, w - 3, 57); ctx.fillStyle = WHITE; ctx.fillText(sk, sx + 20, sy + 41); sx += w + 16; });
    /* counts (real only) */
    var nb = (D.badges || []).length, nc = (D.certificates || []).length;
    ctx.fillStyle = MUT; ctx.font = "700 28px " + F.mono; ctx.fillText(nb + " BADGE" + (nb === 1 ? "" : "S") + "  ·  " + nc + " CERTIFICATE" + (nc === 1 ? "" : "S"), 72, Math.min(sy + 140, 1190));
    /* footer bar */
    ctx.fillStyle = OR; ctx.fillRect(0, H - 110, W, 110); ctx.fillStyle = NAVY; ctx.font = "400 36px " + F.disp; ctx.fillText("START AT 101.", 72, H - 42);
    ctx.font = "700 28px " + F.mono; ctx.textAlign = "right"; ctx.fillText(linkText(), W - 72, H - 44); ctx.textAlign = "left";
  }
  function publicUrl() { var p = D.profile || {}; return p.username ? SITE + "/u/" + p.username : SITE + "/profile.html"; }
  function linkText() { return publicUrl().replace(/^https?:\/\//, "").slice(0, 46); }
  var slug = function () { return String((D.profile && (D.profile.username || D.profile.display_name)) || "member").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "member"; };
  var toBlob = function (cv, type, q) { return new Promise(function (res) { cv.toBlob(res, type || "image/png", q); }); };
  function shareMsg(t, bad) { var m = $("#pf-share-msg"); m.textContent = ""; m.classList.toggle("bad", !!bad); setTimeout(function () { m.textContent = t; }, 30); }
  async function shareFile(blob, name, type) {
    var file = new File([blob], name, { type: type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "My 101 Codecrafts profile", text: "My 101 Codecrafts profile: " + publicUrl() }); shareMsg("Shared."); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    download(blob, name); shareMsg("This browser can't share files, so it was downloaded instead.");
  }
  function download(blob, name) { if (window.CC_SHARE && CC_SHARE.download) return CC_SHARE.download(blob, name); var u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }

  /* ------------------------------------------------------------ share: PDF (A4 @150 dpi, JPEG pages in a minimal PDF) */
  var A4 = { w: 1240, h: 1754, m: 96 };
  async function pdfPages(secs) {
    var p = D.profile || {}, pages = [], cv, ctx, y;
    function page() { cv = document.createElement("canvas"); cv.width = A4.w; cv.height = A4.h; ctx = cv.getContext("2d"); pages.push(cv);
      ctx.fillStyle = WHITE; ctx.fillRect(0, 0, A4.w, A4.h); ctx.fillStyle = NAVY; ctx.fillRect(0, 0, A4.w, 150); ctx.fillStyle = OR; ctx.fillRect(0, 150, A4.w, 12);
      ctx.fillStyle = WHITE; ctx.font = "400 40px " + F.disp; ctx.fillText("101 CODECRAFTS", A4.m, 96); ctx.font = "700 22px " + F.mono; ctx.textAlign = "right"; ctx.fillText("MEMBER PROFILE", A4.w - A4.m, 92); ctx.textAlign = "left";
      ctx.fillStyle = "#44506E"; ctx.font = "500 20px " + F.mono; ctx.fillText(linkText() + "  ·  page " + pages.length, A4.m, A4.h - 50); y = 230; }
    function need(h) { if (y + h > A4.h - 110) page(); }
    function heading(t) { need(90); ctx.fillStyle = NAVY; ctx.fillRect(A4.m, y, 14, 40); ctx.font = "400 34px " + F.disp; ctx.fillText(t, A4.m + 30, y + 34); y += 70; }
    function para(t, font, color, lh) { ctx.font = font || "500 28px " + F.sans; ctx.fillStyle = color || NAVY; wrap(ctx, t, A4.w - A4.m * 2).forEach(function (l) { need(lh || 40); ctx.fillText(l, A4.m, y + (lh || 40) - 10); y += lh || 40; }); y += 18; }
    page();
    /* header block */
    var av = await loadImg(D.image), as = 200;
    ctx.fillStyle = NAVY; ctx.fillRect(A4.m + 10, y + 10, as, as); ctx.fillStyle = OR; ctx.fillRect(A4.m, y, as, as); ctx.lineWidth = 5; ctx.strokeStyle = NAVY; ctx.strokeRect(A4.m + 2.5, y + 2.5, as - 5, as - 5);
    if (av) { var s = Math.min(av.width, av.height); ctx.drawImage(av, (av.width - s) / 2, (av.height - s) / 2, s, s, A4.m + 5, y + 5, as - 10, as - 10); }
    else { ctx.fillStyle = NAVY; ctx.font = "400 84px " + F.disp; ctx.textAlign = "center"; ctx.fillText(initials(p.display_name), A4.m + as / 2, y + as / 2 + 30); ctx.textAlign = "left"; }
    var tx = A4.m + as + 50, tw = A4.w - tx - A4.m; ctx.fillStyle = NAVY; ctx.font = "400 60px " + F.disp;
    var nl = wrap(ctx, String(p.display_name || "101 Member").toUpperCase(), tw, 2); nl.forEach(function (l, i) { ctx.fillText(l, tx, y + 60 + i * 66); });
    var ty = y + 60 + nl.length * 66; ctx.font = "700 26px " + F.mono; ctx.fillStyle = "#146c9f"; if (p.username) { ctx.fillText("@" + p.username, tx, ty); ty += 42; }
    ctx.fillStyle = "#44506E"; ctx.font = "600 26px " + F.sans; ctx.fillText([ROLE[D.role] || "Learner", EDU[p.education_level], p.location].filter(Boolean).join("  ·  "), tx, ty);
    y += as + 50; if (p.headline) para(p.headline, "600 32px " + F.sans, NAVY, 44);
    if (secs.about && p.bio) { heading("ABOUT"); para(p.bio); }
    if (secs.education && (p.education_level || p.institution || p.class_year)) { heading("EDUCATION"); para([EDU[p.education_level], p.institution, p.class_year].filter(Boolean).join("  ·  ")); }
    if (secs.skills && (p.skills || []).length) { heading("SKILLS"); var sx = A4.m; ctx.font = "700 26px " + F.sans; need(70);
      p.skills.forEach(function (sk) { var w = ctx.measureText(sk).width + 36; if (sx + w > A4.w - A4.m) { sx = A4.m; y += 66; need(70); } ctx.fillStyle = "#EEF1F8"; ctx.fillRect(sx, y, w, 52); ctx.lineWidth = 3; ctx.strokeStyle = NAVY; ctx.strokeRect(sx + 1.5, y + 1.5, w - 3, 49); ctx.fillStyle = NAVY; ctx.fillText(sk, sx + 18, y + 36); sx += w + 14; });
      y += 90; }
    if (secs.links) { var L = [p.github_username && "github.com/" + p.github_username, p.linkedin_url, p.website_url].filter(Boolean); if (L.length) { heading("LINKS"); L.forEach(function (l) { para(l, "600 26px " + F.mono, "#146c9f", 36); }); } }
    if (secs.badges && (D.badges || []).length) { heading("BADGES"); D.badges.forEach(function (b) { var x = b.badges || b; para("■  " + (x.name || x.code) + (b.awarded_at ? "  ·  " + fmt(b.awarded_at) : ""), "600 26px " + F.sans, NAVY, 38); }); }
    if (secs.certificates && (D.certificates || []).length) { heading("CERTIFICATES"); D.certificates.forEach(function (c) { para("■  " + c.title + "  ·  " + fmt(c.issued_at) + "  ·  verify code " + c.verify_code, "600 26px " + F.sans, NAVY, 38); }); }
    return pages;
  }
  function b64ToBytes(b64) { var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  async function makePdf(secs) {
    try { await document.fonts.ready; } catch (e) {}
    var pages = await pdfPages(secs), enc = new TextEncoder(), parts = [], off = 0, xref = [];
    var push = function (x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); off += b.length; };
    var n = pages.length, pw = 595.28, ph = 841.89;   /* A4 in points */
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    var obj = function (id, body) { xref[id] = off; push(id + " 0 obj\n"); body(); push("\nendobj\n"); };
    obj(1, function () { push("<< /Type /Catalog /Pages 2 0 R >>"); });
    var kids = []; for (var i = 0; i < n; i++) kids.push((3 + i * 3) + " 0 R");
    obj(2, function () { push("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>"); });
    for (i = 0; i < n; i++) {
      var jpg = b64ToBytes(pages[i].toDataURL("image/jpeg", 0.86).split(",")[1]), pid = 3 + i * 3, iid = pid + 1, cid = pid + 2;
      var content = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im" + i + " Do Q";
      obj(pid, function () { push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] /Resources << /XObject << /Im" + i + " " + iid + " 0 R >> >> /Contents " + cid + " 0 R >>"); });
      obj(iid, function () { push("<< /Type /XObject /Subtype /Image /Width " + A4.w + " /Height " + A4.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpg.length + " >>\nstream\n"); push(jpg); push("\nendstream"); });
      obj(cid, function () { push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream"); });
    }
    var info = 3 + n * 3, nm = String((D.profile && D.profile.display_name) || "Member").replace(/[()\\]/g, "");
    obj(info, function () { push("<< /Title (101 Codecrafts profile: " + nm.replace(/[^\x20-\x7e]/g, "") + ") /Producer (101 Codecrafts) >>"); });
    var xo = off; push("xref\n0 " + (info + 1) + "\n0000000000 65535 f \n");
    for (i = 1; i <= info; i++) push(String(xref[i]).padStart(10, "0") + " 00000 n \n");
    push("trailer\n<< /Size " + (info + 1) + " /Root 1 0 R /Info " + info + " 0 R >>\nstartxref\n" + xo + "\n%%EOF");
    return new Blob(parts, { type: "application/pdf" });
  }
  var sections = function () { var o = {}; $$("#pp-pdf input[type=checkbox]").forEach(function (c) { o[c.value] = c.checked; }); return o; };

  /* ------------------------------------------------------------ share dialog */
  function openShare() {
    var dlg = $("#pf-share"), cv = $("#pf-canvas"), p = D.profile || {};
    var url = publicUrl(); $("#pf-url").value = url;
    $("[data-link-note]").innerHTML = D.own && !p.is_public ? "Your profile is private, so this link only works for you. Turn on <a href=\"settings.html#privacy\">Public profile</a> to share it." : !p.username && D.own ? "Choose a username in <a href=\"settings.html#profile\">Edit profile</a> to get a short /u/ link." : "";
    var t = encodeURIComponent("My 101 Codecrafts profile"), u = encodeURIComponent(url);
    $("[data-wa]").href = "https://wa.me/?text=" + t + "%20" + u; $("[data-li]").href = "https://www.linkedin.com/sharing/share-offsite/?url=" + u; $("[data-xs]").href = "https://x.com/intent/post?text=" + t + "&url=" + u;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    drawCard(cv);
  }
  function wireShare() {
    var dlg = $("#pf-share"); if (!dlg) return;
    $("[data-close]", dlg).onclick = function () { dlg.close ? dlg.close() : dlg.removeAttribute("open"); };
    var tabs = $$("[role=tab]", dlg);
    var sel = function (t) { tabs.forEach(function (x) { var on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; $("#" + x.getAttribute("aria-controls")).hidden = !on; }); t.focus(); };
    tabs.forEach(function (t, i) { t.onclick = function () { sel(t); }; t.onkeydown = function (e) { if (e.key === "ArrowRight") sel(tabs[(i + 1) % tabs.length]); if (e.key === "ArrowLeft") sel(tabs[(i - 1 + tabs.length) % tabs.length]); }; });
    $("[data-dl-img]", dlg).onclick = async function () { var b = await toBlob($("#pf-canvas")); download(b, "101-codecrafts-" + slug() + ".png"); shareMsg("PNG downloaded."); };
    $("[data-share-img]", dlg).onclick = async function () { var b = await toBlob($("#pf-canvas")); shareFile(b, "101-codecrafts-" + slug() + ".png", "image/png"); };
    $("[data-dl-pdf]", dlg).onclick = async function () { this.disabled = true; shareMsg("Making your PDF…"); try { download(await makePdf(sections()), "101-codecrafts-" + slug() + ".pdf"); shareMsg("PDF downloaded."); } catch (e) { shareMsg("Couldn't make the PDF on this device.", true); } this.disabled = false; };
    $("[data-share-pdf]", dlg).onclick = async function () { this.disabled = true; try { shareFile(await makePdf(sections()), "101-codecrafts-" + slug() + ".pdf", "application/pdf"); } catch (e) { shareMsg("Couldn't make the PDF on this device.", true); } this.disabled = false; };
    $("[data-copy]", dlg).onclick = async function () { var ok = window.CC_SHARE ? await CC_SHARE.copy($("#pf-url").value) : false; if (!ok) { $("#pf-url").select(); try { ok = document.execCommand("copy"); } catch (e) {} } shareMsg(ok ? "Link copied." : "Select the link and copy it."); };
  }
  window.CC_PROFILE = { pdf: function (s) { return makePdf(s || { about: 1, skills: 1, education: 1, links: 1, badges: 1, certificates: 1 }); }, card: drawCard, data: function () { return D; }, _set: function (d) { D = d; render(); } };
  function init() { wireShare(); boot(); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
