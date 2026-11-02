/*!
 * Live sessions — API client with local stubs.
 * Real endpoints (backend /api/v1, owned by the backend workstream):
 *   GET  /api/v1/sessions                       → { sessions: Session[] }
 *   POST /api/v1/sessions                       → { session }
 *   GET  /api/v1/sessions/:id                   → { session }
 *   POST /api/v1/sessions/:id/join              → { url, provider, embed: boolean }
 *   GET  /api/v1/sessions/:id/attendance        → { attendance: Attendee[] }
 *   GET  /api/v1/integrations                   → { integrations: {provider, connected, account?}[] }
 *   POST /api/v1/integrations/:provider/connect → { authorize_url }  (OAuth: google_meet | zoom | teams)
 *   POST /api/v1/integrations/:provider/disconnect
 * If an endpoint is missing (404/501/network), the stub below keeps the UI usable
 * (data in localStorage, Jitsi room links generated client-side). Nothing secret
 * ever lives in the browser: OAuth tokens stay on the server.
 */
(function () {
  "use strict";
  var LS = "101-sessions-stub-v1";
  var PROVIDERS = {
    jitsi: { label: "Jitsi Meet", embed: true, oauth: false },
    google_meet: { label: "Google Meet", embed: false, oauth: true },
    zoom: { label: "Zoom", embed: false, oauth: true },
    teams: { label: "Microsoft Teams", embed: false, oauth: true },
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(LS)) || null; } catch (e) { return null; }
  }
  function save(db) { try { localStorage.setItem(LS, JSON.stringify(db)); } catch (e) {} }
  function rid() {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function jitsiRoom(id) { return "101Codecrafts-" + id; }
  function seed() {
    var db = load();
    if (db) return db;
    var t = new Date(); t.setDate(t.getDate() + 1); t.setHours(17, 0, 0, 0);
    var id = rid();
    db = {
      integrations: { jitsi: { connected: true, default: true }, google_meet: { connected: false }, zoom: { connected: false }, teams: { connected: false } },
      sessions: [{ id: id, title: "Intro to Git & GitHub — live Q&A (demo)", description: "Demo session created by the local stub.", provider: "jitsi", starts_at: t.toISOString(), duration_min: 60, capacity: 30, whiteboard: true, room: jitsiRoom(id), role: "tutor", tutor: "You", attendance: [] }],
    };
    save(db);
    return db;
  }
  function api(path, opts) {
    return fetch("/api/v1" + path, Object.assign({ credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" } }, opts || {}))
      .then(function (r) {
        if (r.status === 404 || r.status === 501 || r.status === 405) throw { stub: true };
        return r.json().then(function (j) { if (!r.ok) throw { stub: false, status: r.status, message: (j && (j.message || j.error)) || "Request failed" }; return j; });
      }, function () { throw { stub: true }; });
  }
  function orStub(promise, stubFn) {
    return promise.catch(function (e) { if (e && e.stub) return stubFn(); throw e; });
  }

  window.SessionsAPI = {
    PROVIDERS: PROVIDERS,
    list: function () {
      return orStub(api("/sessions"), function () { return { sessions: seed().sessions, stub: true }; });
    },
    get: function (id) {
      return orStub(api("/sessions/" + encodeURIComponent(id)), function () {
        var s = seed().sessions.filter(function (x) { return x.id === id; })[0];
        if (!s) throw { status: 404, message: "Session not found" };
        return { session: s, stub: true };
      });
    },
    create: function (input) {
      return orStub(api("/sessions", { method: "POST", body: JSON.stringify(input) }), function () {
        var db = seed(), id = rid();
        var s = Object.assign({ id: id, role: "tutor", tutor: "You", attendance: [] }, input, { room: input.provider === "jitsi" ? jitsiRoom(id) : null });
        db.sessions.unshift(s); save(db);
        return { session: s, stub: true };
      });
    },
    join: function (id) {
      return orStub(api("/sessions/" + encodeURIComponent(id) + "/join", { method: "POST", body: "{}" }), function () {
        var db = seed(), s = db.sessions.filter(function (x) { return x.id === id; })[0];
        if (!s) throw { status: 404, message: "Session not found" };
        var me = (document.querySelector(".chip-me b") || {}).textContent || "Member";
        s.attendance = s.attendance || [];
        if (!s.attendance.some(function (a) { return a.name === me; })) s.attendance.push({ name: me, joined_at: new Date().toISOString(), role: s.role === "tutor" ? "Tutor" : "Learner" });
        save(db);
        if (s.provider === "jitsi") return { provider: "jitsi", embed: true, url: "https://meet.jit.si/" + encodeURIComponent(s.room || jitsiRoom(s.id)), stub: true };
        return { provider: s.provider, embed: false, url: s.join_url || null, stub: true, message: PROVIDERS[s.provider].label + " links are created by the server once the tutor connects " + PROVIDERS[s.provider].label + "." };
      });
    },
    attendance: function (id) {
      return orStub(api("/sessions/" + encodeURIComponent(id) + "/attendance"), function () {
        var s = seed().sessions.filter(function (x) { return x.id === id; })[0];
        return { attendance: (s && s.attendance) || [], stub: true };
      });
    },
    integrations: function () {
      return orStub(api("/integrations"), function () {
        var i = seed().integrations;
        return { integrations: Object.keys(PROVIDERS).map(function (p) { return { provider: p, connected: !!(i[p] && i[p].connected), default: !!(i[p] && i[p].default) }; }), stub: true };
      });
    },
    connect: function (provider) {
      return orStub(api("/integrations/" + provider + "/connect", { method: "POST", body: "{}" }), function () {
        return { authorize_url: null, stub: true, message: "OAuth for " + PROVIDERS[provider].label + " is enabled once the backend integration is live." };
      });
    },
    disconnect: function (provider) {
      return orStub(api("/integrations/" + provider + "/disconnect", { method: "POST", body: "{}" }), function () {
        var db = seed(); if (provider !== "jitsi") db.integrations[provider] = { connected: false }; save(db); return { ok: true, stub: true };
      });
    },
    setDefault: function (provider) {
      var db = seed();
      Object.keys(db.integrations).forEach(function (p) { db.integrations[p].default = p === provider; });
      save(db);
      return Promise.resolve({ ok: true });
    },
  };
})();
