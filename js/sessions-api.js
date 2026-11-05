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
 * Round 11: the localStorage stub (a seeded demo session, fake attendance) runs ONLY for ?static=1 or an admin's
 * ?demo=1. A real visit whose endpoint is missing gets an honest empty list or a clear "not available" error;
 * nothing is pretended to be scheduled, joined or connected. Nothing secret
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
  var STATIC = /[?&]static(=|&|$)/.test(location.search), DEMO_URL = /[?&]demo=1(&|$)/.test(location.search);
  function demoOK() { return STATIC || (DEMO_URL && !!(window.CCAccess && CCAccess.can && CCAccess.can("demo.view"))); }
  function accessReady() { return DEMO_URL && window.CCAccess && CCAccess.ready ? Promise.resolve(CCAccess.ready).catch(function () {}) : Promise.resolve(); }
  var OFF = "Live sessions aren't available right now. Nothing was scheduled or joined.";
  /* realFn: what a real (non-demo) visit gets when the endpoint is missing */
  function orStub(promise, stubFn, realFn) {
    if (STATIC) promise.catch(function () {});
    var p = STATIC ? Promise.reject({ stub: true }) : promise;
    return p.catch(function (e) {
      if (!(e && e.stub)) throw e;
      return accessReady().then(function () {
        if (demoOK()) return stubFn();
        if (realFn) return realFn();
        throw { stub: false, status: 503, message: OFF };
      });
    });
  }

  window.SessionsAPI = {
    PROVIDERS: PROVIDERS, demoOK: demoOK,
    list: function () {
      return orStub(STATIC ? Promise.reject({ stub: true }) : api("/sessions"), function () { return { sessions: seed().sessions, stub: true }; }, function () { return { sessions: [], offline: true }; });
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
        var me = (document.querySelector(".acct-user:not([hidden]) .acct-name") || {}).textContent || "Member";
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
      }, function () { return { attendance: [], offline: true }; });
    },
    integrations: function () {
      return orStub(api("/integrations"), function () {
        var i = seed().integrations;
        return { integrations: Object.keys(PROVIDERS).map(function (p) { return { provider: p, connected: !!(i[p] && i[p].connected), default: !!(i[p] && i[p].default) }; }), stub: true };
      }, function () { return { integrations: Object.keys(PROVIDERS).map(function (p) { return { provider: p, connected: false, default: false }; }), offline: true }; });
    },
    connect: function (provider) {
      return orStub(api("/integrations/" + provider + "/connect", { method: "POST", body: "{}" }), function () {
        return { authorize_url: null, stub: true, message: "OAuth for " + PROVIDERS[provider].label + " is enabled once the backend integration is live." };
      }, function () { return { authorize_url: null, offline: true, message: "Connecting " + PROVIDERS[provider].label + " isn't available yet. Nothing was changed." }; });
    },
    disconnect: function (provider) {
      return orStub(api("/integrations/" + provider + "/disconnect", { method: "POST", body: "{}" }), function () {
        var db = seed(); if (provider !== "jitsi") db.integrations[provider] = { connected: false }; save(db); return { ok: true, stub: true };
      });
    },
    setDefault: function (provider) {
      if (!demoOK()) return Promise.resolve({ ok: false, offline: true, message: OFF });
      var db = seed();
      Object.keys(db.integrations).forEach(function (p) { db.integrations[p].default = p === provider; });
      save(db);
      return Promise.resolve({ ok: true });
    },
  };
})();
