/*!
 * Live sessions UI: Connected apps (tutor settings), schedule form, session page
 * (Join, embedded Jitsi + Excalidraw whiteboard side by side, attendance, .ics).
 * Pages: sessions.html, session.html?id=…, settings-apps.html
 */
(function () {
  "use strict";
  var A = window.SessionsAPI;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(iso) {
    try { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala", timeZoneName: "short" }).format(new Date(iso)); } catch (e) { return iso; }
  }
  function toast(el, msg, bad) { if (!el) return; el.textContent = msg; el.className = "ses-msg" + (bad ? " bad" : ""); }

  // ------------------------------------------------------------------ .ics
  function icsDate(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function icsEscape(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&"); }
  function fold(line) { var out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = " " + line.slice(74); } out.push(line); return out.join("\r\n"); }
  window.buildIcs = function (s, pageUrl) {
    var start = new Date(s.starts_at), end = new Date(start.getTime() + (Number(s.duration_min) || 60) * 60000);
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//101 Codecrafts//Live sessions//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT", "UID:" + s.id + "@101codecrafts", "DTSTAMP:" + icsDate(new Date()), "DTSTART:" + icsDate(start), "DTEND:" + icsDate(end),
      "SUMMARY:" + icsEscape(s.title), "DESCRIPTION:" + icsEscape((s.description || "") + "\nJoin: " + pageUrl), "URL:" + pageUrl,
      "LOCATION:" + icsEscape(A.PROVIDERS[s.provider] ? A.PROVIDERS[s.provider].label : "Online"),
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(s.title + " starts in 15 minutes"), "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"];
    return lines.map(fold).join("\r\n") + "\r\n";
  };
  function downloadIcs(s) {
    var url = location.origin + location.pathname.replace(/[^/]*$/, "") + "session.html?id=" + encodeURIComponent(s.id);
    var blob = new Blob([window.buildIcs(s, url)], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (s.title || "session").replace(/[^\w-]+/g, "-").slice(0, 60) + ".ics"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ------------------------------------------------------ Connected apps ---
  function initApps() {
    var box = $("#apps"); if (!box) return;
    var msg = $("#apps-msg");
    function draw() {
      A.integrations().then(function (r) {
        box.innerHTML = r.integrations.map(function (i) {
          var p = A.PROVIDERS[i.provider];
          var right = i.provider === "jitsi"
            ? '<span class="ses-pill ok">On by default · no account needed</span>'
            : i.connected
              ? '<span class="ses-pill ok">Connected</span><button class="btn sm" data-disc="' + i.provider + '">Disconnect</button>'
              : '<button class="btn sm or" data-conn="' + i.provider + '">Connect ' + esc(p.label) + "</button>";
          return '<div class="ses-app"><span class="ses-logo ses-' + i.provider + '" aria-hidden="true"></span><div class="grow"><b>' + esc(p.label) + "</b><small>" +
            (i.provider === "jitsi" ? "Free, open-source video. Rooms embed right inside 101 next to the whiteboard." : "Create " + esc(p.label) + " links automatically when you schedule a session.") +
            "</small></div>" + right + '<label class="ses-def"><input type="radio" name="def" value="' + i.provider + '"' + (i.default ? " checked" : "") + (i.provider !== "jitsi" && !i.connected ? " disabled" : "") + "> Default</label></div>";
        }).join("");
        if (r.stub) toast(msg, "Preview mode: integrations are simulated until the backend endpoints are live.");
      });
    }
    box.addEventListener("click", function (e) {
      var c = e.target.closest("[data-conn]"), d = e.target.closest("[data-disc]");
      if (c) A.connect(c.getAttribute("data-conn")).then(function (r) {
        if (r.authorize_url && /^https:\/\//.test(r.authorize_url)) location.href = r.authorize_url; else toast(msg, r.message || "Connection started.");
      }, function (err) { toast(msg, err.message || "Couldn't connect.", true); });
      if (d) A.disconnect(d.getAttribute("data-disc")).then(draw);
    });
    box.addEventListener("change", function (e) { if (e.target.name === "def") A.setDefault(e.target.value).then(function () { toast(msg, "Default video app saved."); }); });
    draw();
  }

  // ------------------------------------------------- list + schedule form ---
  function initList() {
    var list = $("#ses-list"); if (!list) return;
    function draw() {
      A.list().then(function (r) {
        var ss = (r.sessions || []).slice().sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
        list.innerHTML = ss.length ? ss.map(function (s) {
          var d = new Date(s.starts_at);
          return '<a class="li ses-li" href="session.html?id=' + encodeURIComponent(s.id) + '"><span class="date"><span>' + d.toLocaleString("en-GB", { month: "short", timeZone: "Africa/Kampala" }).toUpperCase() + "<br><b>" + d.toLocaleString("en-GB", { day: "numeric", timeZone: "Africa/Kampala" }) + '</b></span></span><div class="grow"><b>' + esc(s.title) + "</b><small>" + esc(fmt(s.starts_at)) + " · " + esc((A.PROVIDERS[s.provider] || {}).label || s.provider) + (s.whiteboard ? " · whiteboard" : "") + '</small></div><span class="ses-pill">Open →</span></a>';
        }).join("") : '<p class="ses-empty">No sessions yet.</p>';
      });
    }
    var form = $("#ses-form");
    if (form) {
      A.integrations().then(function (r) {
        var sel = form.provider;
        sel.innerHTML = r.integrations.map(function (i) {
          var p = A.PROVIDERS[i.provider], ok = i.provider === "jitsi" || i.connected;
          return '<option value="' + i.provider + '"' + (ok ? "" : " disabled") + (i.default ? " selected" : "") + ">" + esc(p.label) + (ok ? "" : " — connect in Connected apps") + "</option>";
        }).join("");
      });
      var t = new Date(Date.now() + 864e5); t.setMinutes(0, 0, 0);
      var pad = function (n) { return ("0" + n).slice(-2); };
      form.starts_at.value = t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate()) + "T" + pad(t.getHours()) + ":00";
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var msg = $("#ses-form-msg");
        var when = new Date(form.starts_at.value);
        var FE = window.CC_UI && window.CC_UI.fieldError || function () {};
        FE(form.title, ""); FE(form.starts_at, "");
        if (!form.title.value.trim()) FE(form.title, "Add a title for your session.");
        if (isNaN(when.getTime())) FE(form.starts_at, "Pick a date and time.");
        else if (when.getTime() < Date.now() - 6e4) FE(form.starts_at, "Pick a time in the future.");
        var bad = form.querySelector("[aria-invalid=true]"); if (bad) { bad.focus(); return toast(msg, "Check the details marked above.", true); }
        var input = { title: form.title.value.trim().slice(0, 140), description: form.description.value.trim().slice(0, 2000), starts_at: when.toISOString(), duration_min: Math.min(480, Math.max(15, Number(form.duration_min.value) || 60)), capacity: Math.min(500, Math.max(1, Number(form.capacity.value) || 30)), provider: form.provider.value, whiteboard: form.whiteboard.checked };
        A.create(input).then(function (r) { toast(msg, "Session scheduled."); form.reset(); draw(); if (r.session) setTimeout(function () { location.href = "session.html?id=" + encodeURIComponent(r.session.id); }, 600); }, function (err) { toast(msg, err.message || "Couldn't schedule.", true); });
      });
    }
    draw();
  }

  // -------------------------------------------------------- session page ---
  function initSession() {
    var root = $("#ses-root"); if (!root) return;
    var id = new URLSearchParams(location.search).get("id");
    const emptyPage = (h, msg) => '<div class="page-h"><div><div class="kicker">Live session</div><h1>' + h + '</h1><p>' + msg + '</p></div></div>' +
      '<div class="empty-state"><p>Join a live class, open the shared whiteboard or add a session to your calendar from your schedule.</p><a class="btn or" href="sessions.html">See all sessions</a></div>';
    if (!id) { root.innerHTML = emptyPage("NO SESSION SELECTED", "Open a session from your schedule to see its room."); return; }
    A.get(id).then(function (r) {
      var s = r.session, p = A.PROVIDERS[s.provider] || { label: s.provider, embed: false };
      $("#ses-title").textContent = s.title;
      $("#ses-when").textContent = fmt(s.starts_at) + " · " + (s.duration_min || 60) + " min · " + p.label;
      $("#ses-desc").textContent = s.description || "";
      $("#ses-ics").addEventListener("click", function () { downloadIcs(s); });
      var wbSrc = "/whiteboard/" + (s.whiteboard_id && /^[0-9a-f-]{36}$/i.test(s.whiteboard_id) ? s.whiteboard_id : "scratch");
      var stage = $("#ses-stage"), video = $("#ses-video"), board = $("#ses-board");
      var joinBtn = $("#ses-join"), msg = $("#ses-join-msg");
      $("#ses-wb-toggle").hidden = !s.whiteboard;
      var tab = $("#ses-wb-tab"); if (tab) { tab.href = wbSrc; tab.hidden = !s.whiteboard; }
      joinBtn.addEventListener("click", function () {
        joinBtn.disabled = true; toast(msg, "Joining…");
        A.join(id).then(function (j) {
          joinBtn.disabled = false;
          if (j.embed && /^https:\/\/meet\.jit\.si\//.test(j.url)) {
            video.innerHTML = '<iframe title="Live session video (Jitsi Meet)" src="' + esc(j.url) + '#config.prejoinPageEnabled=true&interfaceConfig.SHOW_JITSI_WATERMARK=false" allow="camera; microphone; display-capture; fullscreen; autoplay" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
            stage.hidden = false; toast(msg, "You're in. Allow camera/microphone when your browser asks.");
            if (s.whiteboard && !board.firstChild) openBoard();
          } else if (j.url && /^https:\/\//.test(j.url)) {
            window.open(j.url, "_blank", "noopener"); toast(msg, "Opened " + p.label + " in a new tab.");
          } else toast(msg, j.message || "The join link isn't ready yet.", !j.url);
          loadAttendance();
        }, function (err) { joinBtn.disabled = false; toast(msg, err.message || "Couldn't join.", true); });
      });
      function openBoard() {
        board.innerHTML = '<iframe title="Session whiteboard" src="' + wbSrc + '"></iframe>';
        stage.hidden = false; stage.classList.add("with-board");
      }
      $("#ses-wb-toggle").addEventListener("click", function () {
        if (board.firstChild) { board.innerHTML = ""; stage.classList.remove("with-board"); if (!video.firstChild) stage.hidden = true; }
        else openBoard();
      });
      var att = $("#ses-att");
      function loadAttendance() {
        if (s.role !== "tutor" || !att) return;
        att.parentElement.hidden = false;
        A.attendance(id).then(function (a) {
          var rows = a.attendance || [];
          att.innerHTML = rows.length ? rows.map(function (x) { return "<tr><td>" + esc(x.name) + "</td><td>" + esc(x.role || "Learner") + "</td><td>" + esc(x.joined_at ? fmt(x.joined_at) : "—") + "</td></tr>"; }).join("") : '<tr><td colspan="3">Nobody has joined yet.</td></tr>';
          $("#ses-att-count").textContent = rows.length + (s.capacity ? " / " + s.capacity : "");
        });
      }
      loadAttendance();
      if (r.stub) toast($("#ses-stub"), "Preview mode: using local demo data until /api/v1/sessions is live.");
    }, function (err) { root.innerHTML = emptyPage("SESSION UNAVAILABLE", esc(err.message || "Check your connection and try again.")); });
  }

  function boot() { initApps(); initList(); initSession(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
