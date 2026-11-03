/* 101 Member Card generator (card.html). Everything happens in this browser: the photo is read with an object URL,
   drawn on a <canvas>, and exported as a PNG. Nothing is uploaded.
   Preview gestures: drag (pointer capture) to move, two-finger pinch / wheel / +- keys to zoom, arrow keys to move, 0 resets. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var form = $("#cd-form"); if (!form) return;
  var cv = $("#cd-canvas"), ctx = cv.getContext("2d");
  var NAVY = "#0B1236", NAVY2 = "#111A45", NAVY3 = "#1A2560", OR = "#fc8c0c", CY = "#05e6f2", MUTED = "#B9C1DA", WHITE = "#ffffff";
  var MAX_BYTES = 10 * 1024 * 1024, NAME_MAX = 28, ZMIN = 1, ZMAX = 4;
  var HEAD = { Learner: "I'm learning at", Tutor: "I'm teaching at", Mentor: "I'm mentoring at", Volunteer: "I'm volunteering at",
               Builder: "I'm building at", Organizer: "I'm organizing at", Speaker: "I'm speaking at" };
  var canon = ($('link[rel="canonical"]') || {}).href || location.href;
  var SITE = new URL(".", canon).href;                                  // canonical site root
  var SITE_TXT = SITE.replace(/^https?:\/\//, "").replace(/\/$/, "");

  var st = { img: null, url: null, name: "", role: "Learner", level: "", format: "square", z: 1, nx: 0, ny: 0, since: new Date(), capDirty: false, nameDirty: false };
  var logo = null, fontsOk = false, frame = { x: 0, y: 0, s: 1 };

  var nameIn = $("#cd-name"), count = $("#cd-count"), ready = $("#cd-ready"), live = $("#cd-live"), status = $("#cd-status"),
      cap = $("#cd-cap"), dl = $("#cd-dl"), sh = $("#cd-share"), need = $("#cd-need"), perr = $("#cd-photo-err"), zr = $("#cd-zoom"), stage = $("#cd-stage");

  /* ---------------------------------------------------------------- helpers */
  var monthYear = function (d) { return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Africa/Kampala" }); };
  var slug = function (s) { return (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "member"; };
  var fileName = function () { return "101-codecrafts-" + slug(st.name) + "-" + st.format + ".png"; };
  var mb = function (n) { return (n / 1048576).toFixed(1).replace(/\.0$/, "") + " MB"; };
  function say(msg) { live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 20); }
  var sayT = null; function sayLater(msg) { clearTimeout(sayT); sayT = setTimeout(function () { say(msg); }, 350); }

  function setFont(px, kind) {
    /* round5 type system: Archivo Black (CC Display subset) for headlines, JetBrains Mono (CC Mono) for labels/chips/URL,
       IBM Plex Sans (CC Sans) for the name and the tagline; Russo One stays only for the "Codecrafts" brand wordmark. */
    var MONO = '"CC Mono", "CC Mono Fallback", "DejaVu Sans Mono", monospace', SANS = '"CC Sans", "CC Sans Fallback", Arial, sans-serif';
    ctx.font = kind === "disp" ? "400 " + px + 'px "CC Display", "Archivo Black", Impact, sans-serif' : kind === "word" ? "400 " + px + 'px "Russo One", sans-serif'
      : kind === "label" ? "700 " + px + "px " + MONO : kind === "label6" ? "600 " + px + "px " + MONO
      : kind === "body6" ? "600 " + px + "px " + SANS : "700 " + px + "px " + SANS;
  }
  function fit(text, kind, maxW, max, min) {                // largest size (step 2px) whose measured width fits maxW
    for (var px = max; px >= min; px -= 2) { setFont(px, kind); if (ctx.measureText(text).width <= maxW) return px; }
    setFont(min, kind); return min;
  }
  /* the name is printed exactly as typed: one line if it fits at >= min, else two lines split at the space nearest the middle */
  function fitName(text, maxW, max, min) {
    for (var px = max; px >= min; px -= 2) { setFont(px, "body"); if (ctx.measureText(text).width <= maxW) return { px: px, lines: [text] }; }
    var mid = text.length / 2, cut = -1;
    for (var i = 0; i < text.length; i++) if (text[i] === " " && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    var lines = cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : [text.slice(0, Math.ceil(mid)), text.slice(Math.ceil(mid))];
    for (px = max; px > 20; px -= 2) { setFont(px, "body"); if (lines.every(function (l) { return ctx.measureText(l).width <= maxW; })) return { px: px, lines: lines }; }
    return { px: 20, lines: lines };
  }
  function tracked(text, x, y, em, align) {               // letter-spaced caps (canvas letterSpacing where supported)
    if ("letterSpacing" in ctx) { ctx.letterSpacing = em + "px"; ctx.textAlign = align || "left"; ctx.fillText(text, x, y); ctx.letterSpacing = "0px"; ctx.textAlign = "left"; return; }
    ctx.textAlign = align || "left"; ctx.fillText(text, x, y); ctx.textAlign = "left";
  }

  /* ---------------------------------------------------------------- drawing */
  function bg(W, H) {
    ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W * .92, H * .06, 0, W * .92, H * .06, W * .9);
    g.addColorStop(0, "rgba(5,230,242,.16)"); g.addColorStop(1, "rgba(5,230,242,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,.055)"; ctx.lineWidth = 2;
    for (var x = 60; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (var y = 60; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    stripe(0, W, 16); stripe(H - 10, W, 10);
  }
  function stripe(y, W, h) { ctx.fillStyle = OR; ctx.fillRect(0, y, W * .34, h); ctx.fillStyle = CY; ctx.fillRect(W * .34, y, W * .33, h); ctx.fillStyle = "#2B3A8C"; ctx.fillRect(W * .67, y, W * .33, h); }
  function header(W, y) {
    var lh = 64, lw = 128;
    if (logo) ctx.drawImage(logo, 72, y, lw, lh);
    setFont(46, "word"); ctx.fillStyle = CY; ctx.textBaseline = "alphabetic"; ctx.fillText("Codecrafts", 72 + lw + 16, y + 48);
    setFont(24, "label"); ctx.fillStyle = MUTED; tracked("MEMBER CARD", W - 72, y + 44, 4, "right");
  }
  function photo(x, y, s) {
    frame = { x: x, y: y, s: s };
    ctx.fillStyle = OR; ctx.fillRect(x + 18, y + 18, s, s);                      // brutal offset shadow
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
    if (st.img) {
      var iw = st.img.naturalWidth || st.img.width, ih = st.img.naturalHeight || st.img.height;
      var sc = Math.max(s / iw, s / ih) * st.z, dw = iw * sc, dh = ih * sc;
      clampPan(dw, dh, s);
      ctx.drawImage(st.img, x + (s - dw) / 2 + st.nx * s, y + (s - dh) / 2 + st.ny * s, dw, dh);
    } else {
      ctx.fillStyle = NAVY3; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.beginPath(); ctx.arc(x + s / 2, y + s * .4, s * .16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + s / 2, y + s * .92, s * .32, s * .26, 0, Math.PI, 0); ctx.fill();
      setFont(Math.round(s * .07), "body"); ctx.fillStyle = MUTED; ctx.textAlign = "center"; ctx.fillText("Your photo", x + s / 2, y + s * .66); ctx.textAlign = "left";
    }
    ctx.restore();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 6; ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);
  }
  function chip(text, x, y, px, alignRight) {
    setFont(px, "label"); var w = ctx.measureText(text).width + px * 1.3, h = px * 1.9;
    if (alignRight) x -= w;
    ctx.fillStyle = CY; ctx.fillRect(x, y, w, h); ctx.fillStyle = NAVY; ctx.textBaseline = "middle"; ctx.fillText(text, x + px * .65, y + h / 2 + 1); ctx.textBaseline = "alphabetic";
    return h;
  }
  function footer(W, H, y) {
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(72, y, W - 144, 2);
    setFont(44, "disp"); ctx.fillStyle = CY; ctx.fillText("#101Codecrafts", 72, y + 72);
    var ux = fit(SITE_TXT, "label6", W - 144 - ctx.measureText("#101Codecrafts").width - 40, 28, 18);
    setFont(ux, "label6"); ctx.fillStyle = MUTED; ctx.textAlign = "right"; ctx.fillText(SITE_TXT, W - 72, y + 66); ctx.textAlign = "left";
    setFont(26, "body6"); ctx.fillStyle = OR; ctx.fillText("Start at 101. Craft your way up.", 72, y + 124);
  }
  function roleLine() { return (st.role + (st.level ? " · " + st.level : "")).toUpperCase(); }

  function draw() {
    var story = st.format === "story", W = 1080, H = story ? 1920 : 1080;
    if (cv.height !== H) cv.height = H; if (cv.width !== W) cv.width = W;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    bg(W, H);
    var head = HEAD[st.role].toUpperCase(), since = "MEMBER SINCE " + monthYear(st.since).toUpperCase(), name = st.name || "Your name";
    if (!story) {
      header(W, 60);
      var p1 = fit(head, "disp", 936, 62, 30); setFont(p1, "disp"); ctx.fillStyle = WHITE; ctx.fillText(head, 72, 196 + p1 * .78);
      var y2 = 196 + p1 * 1.04, p2 = fit("101 CODECRAFTS", "disp", 936, 112, 40); setFont(p2, "disp"); ctx.fillStyle = OR; ctx.fillText("101 CODECRAFTS", 72, y2 + p2 * .8);
      var top = y2 + p2 * .98 + 28, side = Math.min(420, 856 - top);
      photo(72, top, side);
      var cx = 72 + side + 48, cw = W - 72 - cx, nm = fitName(name, cw, 74, 44), ny = top + 8;
      setFont(nm.px, "body"); ctx.fillStyle = st.name ? WHITE : "rgba(255,255,255,.45)";
      nm.lines.forEach(function (l, i) { ctx.fillText(l, cx, ny + nm.px * (.86 + i * 1.08)); });
      ny += nm.px * (nm.lines.length * 1.08) + 26;
      ny += chip(roleLine(), cx, ny, fit(roleLine(), "label", cw - 40, 28, 18)) + 30;
      var sy = Math.max(ny, top + side - 78);                         // member-since sits on the photo's bottom edge
      ctx.fillStyle = OR; ctx.fillRect(cx, sy, 56, 6);
      setFont(22, "label"); ctx.fillStyle = MUTED; tracked("MEMBER SINCE", cx, sy + 38, 3);
      setFont(40, "disp"); ctx.fillStyle = WHITE; ctx.fillText(monthYear(st.since).toUpperCase(), cx, sy + 80);
      footer(W, H, 884);
    } else {
      header(W, 92);
      var s1 = fit(head, "disp", 936, 86, 40); setFont(s1, "disp"); ctx.fillStyle = WHITE; ctx.fillText(head, 72, 268 + s1 * .78);
      var sy2 = 268 + s1 * 1.06, s2 = fit("101 CODECRAFTS", "disp", 936, 124, 48); setFont(s2, "disp"); ctx.fillStyle = OR; ctx.fillText("101 CODECRAFTS", 72, sy2 + s2 * .8);
      var ptop = sy2 + s2 + 40, ps = 780;
      photo((W - ps) / 2 - 9, ptop, ps);
      var nyy = ptop + ps + 92, snm = fitName(name, 936, 104, 56);
      setFont(snm.px, "body"); ctx.fillStyle = st.name ? WHITE : "rgba(255,255,255,.45)";
      snm.lines.forEach(function (l, i) { ctx.fillText(l, 72, nyy + snm.px * (.86 + i * 1.08)); });
      nyy += snm.px * (snm.lines.length * 1.08) + 30;
      chip(roleLine(), 72, nyy, fit(roleLine(), "label", 600, 32, 20));
      setFont(fit(since, "label", 330, 26, 16), "label"); ctx.fillStyle = MUTED; ctx.textAlign = "right"; ctx.fillText(since, W - 72, nyy + 40); ctx.textAlign = "left";
      footer(W, H, 1712);
    }
  }
  var raf = 0; function redraw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }

  /* ---------------------------------------------------------------- pan / zoom */
  function clampPan(dw, dh, s) {
    var mx = Math.max(0, (dw - s) / 2 / s), my = Math.max(0, (dh - s) / 2 / s);
    st.nx = Math.max(-mx, Math.min(mx, st.nx)); st.ny = Math.max(-my, Math.min(my, st.ny));
  }
  function setZoom(z, quiet) { st.z = Math.max(ZMIN, Math.min(ZMAX, z)); zr.value = Math.round(st.z * 100); zr.setAttribute("aria-valuetext", Math.round(st.z * 100) + "%"); if (!quiet) sayLater("Zoom " + Math.round(st.z * 100) + "%"); redraw(); }
  function pan(dxCanvas, dyCanvas) { if (!st.img) return; st.nx += dxCanvas / frame.s; st.ny += dyCanvas / frame.s; redraw(); }
  var ptrs = new Map(), pinch = null;
  var toCanvas = function () { var r = cv.getBoundingClientRect(); return cv.width / (r.width || 1); };
  cv.addEventListener("pointerdown", function (e) {
    if (!st.img) return;
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic or already-released pointer */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { var p = Array.from(ptrs.values()); pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, z: st.z }; }
    cv.classList.add("is-drag"); e.preventDefault();
  });
  cv.addEventListener("pointermove", function (e) {
    if (!ptrs.has(e.pointerId)) return;
    var prev = ptrs.get(e.pointerId), k = toCanvas(); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size >= 2 && pinch) { var p = Array.from(ptrs.values()); setZoom(pinch.z * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / pinch.d); return; }
    pan((e.clientX - prev.x) * k, (e.clientY - prev.y) * k);
  });
  function up(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) cv.classList.remove("is-drag"); }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up); cv.addEventListener("lostpointercapture", up);
  cv.addEventListener("wheel", function (e) { if (!st.img) return; e.preventDefault(); setZoom(st.z * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015))); }, { passive: false });
  cv.addEventListener("keydown", function (e) {
    var step = e.shiftKey ? .08 : .02, k = e.key, done = true;
    if (k === "ArrowLeft") pan(-step * frame.s, 0); else if (k === "ArrowRight") pan(step * frame.s, 0);
    else if (k === "ArrowUp") pan(0, -step * frame.s); else if (k === "ArrowDown") pan(0, step * frame.s);
    else if (k === "+" || k === "=" || k === "Add") setZoom(st.z * 1.1); else if (k === "-" || k === "_" || k === "Subtract") setZoom(st.z / 1.1);
    else if (k === "0") { st.nx = st.ny = 0; setZoom(1, true); say("Photo position reset"); } else done = false;
    if (done) e.preventDefault();
  });
  zr.addEventListener("input", function () { setZoom(zr.value / 100); });
  $("#cd-zin").onclick = function () { setZoom(st.z * 1.2); };
  $("#cd-zout").onclick = function () { setZoom(st.z / 1.2); };
  $("#cd-center").onclick = function () { st.nx = st.ny = 0; setZoom(1, true); say("Photo position reset"); };

  /* ---------------------------------------------------------------- photo input */
  function photoError(msg) { perr.textContent = msg; perr.hidden = !msg; $$("#cd-photo, #cd-selfie").forEach(function (i) { msg ? i.setAttribute("aria-invalid", "true") : i.removeAttribute("aria-invalid"); }); }
  function loadFile(file) {
    if (!file) return;
    var isHeic = /\.(heic|heif)$/i.test(file.name || "") || /heic|heif/i.test(file.type || "");
    if (file.type && !/^image\//.test(file.type) && !isHeic) { photoError("That file isn't a photo. Choose a JPEG, PNG, WebP or HEIC image."); return; }
    if (!file.type && !isHeic && !/\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name || "")) { photoError("That file isn't a photo. Choose a JPEG, PNG, WebP or HEIC image."); return; }
    if (file.size > MAX_BYTES) { photoError("That photo is " + mb(file.size) + ". Choose one under 10 MB, or take a selfie instead."); return; }
    var url = URL.createObjectURL(file), img = new Image();
    img.decoding = "async";
    img.onload = function () {
      if (st.url) URL.revokeObjectURL(st.url);
      st.img = img; st.url = url; st.nx = st.ny = 0; setZoom(1, true); photoError(""); update();
      say("Photo added. Drag the preview to move it, pinch or scroll to zoom.");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      photoError(isHeic ? "This browser can't open HEIC photos. Choose a JPEG or PNG, or on iPhone set Camera › Formats to Most Compatible." : "We couldn't open that photo. Try a different JPEG or PNG.");
    };
    img.src = url;
  }
  $$("#cd-photo, #cd-selfie").forEach(function (inp) { inp.addEventListener("change", function () { loadFile(inp.files && inp.files[0]); inp.value = ""; }); });
  [$("#cd-drop"), stage].forEach(function (z) {
    ["dragenter", "dragover"].forEach(function (t) { z.addEventListener(t, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") > -1) { e.preventDefault(); z.classList.add("is-over"); } }); });
    ["dragleave", "drop"].forEach(function (t) { z.addEventListener(t, function () { z.classList.remove("is-over"); }); });
    z.addEventListener("drop", function (e) { e.preventDefault(); loadFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  });

  /* ---------------------------------------------------------------- name / role / level / format */
  nameIn.maxLength = NAME_MAX;
  nameIn.addEventListener("input", function () { st.nameDirty = true; st.name = nameIn.value.slice(0, NAME_MAX); count.textContent = st.name.length + "/" + NAME_MAX; if (st.name.length === NAME_MAX) say("That's the 28 character limit."); update(); });
  form.addEventListener("change", function (e) {
    var t = e.target; if (!t.name) return;
    if (t.name === "role") st.role = t.value; else if (t.name === "level") st.level = t.value; else if (t.name === "format") { st.format = t.value; say(t.value === "story" ? "Story format, 1080 by 1920" : "Square format, 1080 by 1080"); }
    update();
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  cap.addEventListener("input", function () { st.capDirty = true; });

  function caption() { return HEAD[st.role] + " 101 Codecrafts. Start at 101. Craft your way up. Join me: " + SITE + " #101Codecrafts"; }
  function update() {
    var n = (st.img ? 1 : 0) + (st.name.trim() ? 1 : 0), ok = n === 2;
    ready.textContent = n + "/2 ready"; ready.classList.toggle("ok", ok);
    dl.disabled = sh.disabled = !ok; need.hidden = ok;
    need.textContent = !st.img && !st.name.trim() ? "Add a photo and your name to download." : !st.img ? "Add a photo to download." : "Add your name to download.";
    if (!st.capDirty) cap.value = caption();
    cv.setAttribute("aria-label", "Card preview, " + (st.format === "story" ? "story" : "square") + ". " + (st.name.trim() ? st.name + ", " : "") + HEAD[st.role] + " 101 Codecrafts. " +
      (st.img ? "Drag to move your photo, pinch or scroll to zoom. Arrow keys move, plus and minus zoom, 0 resets." : "Add a photo to place it here."));
    redraw();
  }

  /* ---------------------------------------------------------------- export */
  function blob() { draw(); return new Promise(function (res) { cv.toBlob(res, "image/png"); }); }
  dl.addEventListener("click", async function () { var b = await blob(); window.CC_SHARE.download(b, fileName()); status.textContent = "Saved " + fileName() + "."; });
  sh.addEventListener("click", async function () {
    var b = await blob();
    await window.CC_SHARE.share({ file: b, filename: fileName(), title: "My 101 Codecrafts member card", caption: cap.value, status: status });
  });
  $("#cd-copy").addEventListener("click", async function () {
    var ok = await window.CC_SHARE.copy(cap.value), b = $("#cd-copy");
    status.textContent = ok ? "Caption copied, paste it into your post." : "Select the caption and copy it.";
    b.textContent = ok ? "Copied" : "Copy caption"; setTimeout(function () { b.textContent = "Copy caption"; }, 1800);
  });
  $("#cd-restart").addEventListener("click", function () {
    if (st.url) URL.revokeObjectURL(st.url);
    form.reset(); st.img = null; st.url = null; st.name = ""; st.role = "Learner"; st.level = ""; st.format = "square"; st.nx = st.ny = 0; st.capDirty = false; st.nameDirty = false;
    setZoom(1, true); photoError(""); count.textContent = "0/" + NAME_MAX; status.textContent = ""; prefill(); update();
    $("#cd-photo").focus(); say("Started over.");
  });

  /* ---------------------------------------------------------------- signed-in prefill (guests get a blank name) */
  var who = null;
  function prefill() {
    if (!who) return;
    var n = (who.fullName || [who.firstName, who.lastName].filter(Boolean).join(" ") || "").trim().slice(0, NAME_MAX);
    if (n && !st.nameDirty && !nameIn.value) { nameIn.value = st.name = n; count.textContent = n.length + "/" + NAME_MAX; }
    if (who.createdAt) { var d = new Date(who.createdAt); if (!isNaN(d)) st.since = d; }
  }
  if (window.CC_AUTH && window.CC_AUTH.onChange) window.CC_AUTH.onChange(function (u) { who = u || null; prefill(); update(); });

  /* ---------------------------------------------------------------- logo (its navy tile keyed out) + fonts, then first draw */
  function loadLogo() {
    return new Promise(function (res) {
      var im = new Image(); im.onload = function () {
        try {
          var c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; var x = c.getContext("2d"); x.drawImage(im, 0, 0);
          var d = x.getImageData(0, 0, c.width, c.height), p = d.data, br = p[0], bgc = p[1], bb = p[2];
          for (var i = 0; i < p.length; i += 4) { var dist = Math.abs(p[i] - br) + Math.abs(p[i + 1] - bgc) + Math.abs(p[i + 2] - bb); if (dist < 60) p[i + 3] = Math.max(0, Math.min(255, (dist - 24) * 7)); }
          x.putImageData(d, 0, 0); logo = c;
        } catch (e) { logo = im; }
        res();
      }; im.onerror = function () { res(); }; im.src = "assets/img/logo-101-header@3x.webp";
    });
  }
  var fonts = document.fonts ? Promise.all([document.fonts.load('400 64px "CC Display"'), document.fonts.load('400 46px "Russo One"'), document.fonts.load('700 64px "CC Sans"'), document.fonts.load('600 28px "CC Sans"'), document.fonts.load('700 24px "CC Mono"'), document.fonts.load('600 24px "CC Mono"')])
    .then(function () { return document.fonts.ready; }).catch(function () {}) : Promise.resolve();
  count.textContent = "0/" + NAME_MAX; update();
  Promise.all([fonts, loadLogo()]).then(function () { fontsOk = true; cv.dataset.ready = "1"; draw(); });
  window.CC_CARD = { state: st, draw: draw, fileName: fileName };
})();
